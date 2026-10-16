import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as route53 from 'aws-cdk-lib/aws-route53';

export class PangolinVpsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const defaultUser = 'ubuntu'

    const defaultVpc = ec2.Vpc.fromLookup(
      this,
      "MyDefaultVpc",
      {
        isDefault: true
      }
    )

    const role = new iam.Role(this, 'MyCustomRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com')
    });

    const securityGroup = new ec2.SecurityGroup(this, 'MySecurityGroup',
      {
        vpc: defaultVpc,
      }
    )

    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      "allow SSH access"
    )
    // Acknowledge the "Security group allows 0.0.0.0/0 access to sensitive port 22" validation warning
    cdk.Validations.of(securityGroup).acknowledge({
      id: 'CloudFormation-Validate::W2508',
      reason: 'SSH only accepts key-based login',
    })
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      "allow HTTP"
    )
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      "allow HTTPS"
    )
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.udp(51820),
      "allow Pangolin site tunnels"
    )
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.udp(21820),
      "allow Pangolin client tunnels"
    )
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.icmpPing(),
      "allow ping"
    )

    const keyPair = new ec2.KeyPair(this, 'MyKeyPair', {
      publicKeyMaterial: require('fs').readFileSync('./my-key-pair.pub', { encoding: 'utf-8' })
    })

    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      '# Add swap since Pangolin recommends at least 2GB of RAM - https://docs.pangolin.net/self-host/choosing-a-vps',
      '# Swap file commands explained - https://l422y.com/blog/add-swap-on-aws-ec2-instances',
      'fallocate -l 2G /swapfile',
      'chmod 600 /swapfile',
      'mkswap /swapfile',
      'swapon /swapfile',
      "echo '/swapfile none swap sw 0 0' >> /etc/fstab",
      '# Download the latest Pangolin installer - https://docs.pangolin.net/self-host/quick-install',
      `cd /home/${defaultUser}`,
      'curl -fsSL https://static.pangolin.net/get-installer.sh | bash',
    );

    const instance = new ec2.Instance(
      this,
      "MyEc2Instance",
      {
        vpc: defaultVpc,
        role,
        securityGroup,
        keyPair,
        userData,
        // The AMI ID is cached in cdk.context.json so a new Ubuntu release doesn't replace the instance
        machineImage: ec2.MachineImage.fromSsmParameter(
          // How this SSM parameter path is built - https://ubuntu.com/aws/docs/aws-how-to/instances/find-ubuntu-images/
          '/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id',
          { cachedInContext: true },
        ),
        instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
        creditSpecification: ec2.CpuCredits.STANDARD,
        blockDevices: [
          {
            deviceName: '/dev/sda1',
            volume: ec2.BlockDeviceVolume.ebs(20, {
              volumeType: ec2.EbsDeviceVolumeType.GP3,
              encrypted: true,
            }),
          },
        ],
      }
    )

    // Static IP so the DNS records stay valid if the instance is stopped and started
    const eip = new ec2.CfnEIP(this, 'MyEip', {
      domain: 'vpc',
      instanceId: instance.instanceId,
    })

    // Create the new hosted zone
    const hostedZone = new route53.HostedZone(this, 'MyHostedZone', {
      zoneName: 'homelab.raaedkabir.com',
    });

    new route53.RecordSet(this, 'MyHostedZoneARecord', {
      recordName: 'homelab.raaedkabir.com',
      recordType: route53.RecordType.A,
      target: route53.RecordTarget.fromValues(eip.attrPublicIp),
      zone: hostedZone,
    });

    new route53.RecordSet(this, 'MyHostedZoneWildCardARecord', {
      recordName: '*.homelab.raaedkabir.com',
      recordType: route53.RecordType.A,
      target: route53.RecordTarget.fromValues(eip.attrPublicIp),
      zone: hostedZone,
    });

    // Reference an existing hosted zone by its domain name
    const targetHostedZone = route53.HostedZone.fromLookup(this, 'TargetHostedZone', {
      domainName: 'raaedkabir.com',
    });

    // Get the name servers of the newly created hosted zone
    const nameServers = hostedZone.hostedZoneNameServers as string[];

    // Create a new record in the target hosted zone with the new hosted zone's name servers
    new route53.RecordSet(this, 'MyHostedZoneNameServersRecord', {
      recordName: 'homelab.raaedkabir.com',
      recordType: route53.RecordType.NS,
      target: route53.RecordTarget.fromValues(...nameServers),
      zone: targetHostedZone,
    });

    new cdk.CfnOutput(this, 'EC2-Instance-Ip-Address', {
      value: eip.attrPublicIp
    })
    new cdk.CfnOutput(this, 'SSH-Command', {
      value: `ssh -i my-key-pair ${defaultUser}@${eip.attrPublicIp}`
    })
  }
}
