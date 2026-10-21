import * as cdk from 'aws-cdk-lib/core';
import * as cxschema from 'aws-cdk-lib/cloud-assembly-schema';
import { Construct } from 'constructs';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as ses from 'aws-cdk-lib/aws-ses';

export interface PangolinVpsStackProps extends cdk.StackProps {
  readonly vpsIp: string;
}

export class PangolinVpsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PangolinVpsStackProps) {
    super(scope, id, props);

    // Create the new hosted zone
    const hostedZone = new route53.HostedZone(this, 'MyHostedZone', {
      zoneName: 'homelab.raaedkabir.com',
    });

    new route53.RecordSet(this, 'MyHostedZoneARecord', {
      recordName: 'homelab.raaedkabir.com',
      recordType: route53.RecordType.A,
      target: route53.RecordTarget.fromIpAddresses(props.vpsIp),
      zone: hostedZone,
    });

    new route53.RecordSet(this, 'MyHostedZoneWildCardARecord', {
      recordName: '*.homelab.raaedkabir.com',
      recordType: route53.RecordType.A,
      target: route53.RecordTarget.fromIpAddresses(props.vpsIp),
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

    // Verify the domain in SES so that Pangolin can send email from it
    // This also adds the DKIM records to the hosted zone
    const emailIdentity = new ses.EmailIdentity(this, 'MyEmailIdentity', {
      identity: ses.Identity.publicHostedZone(hostedZone),
    });

    // Add the DMARC record that the SES console recommends
    new route53.TxtRecord(this, 'MyHostedZoneDmarcRecord', {
      recordName: '_dmarc',
      values: ['v=DMARC1; p=none;'],
      zone: hostedZone,
    });

    // Check for the IAM user that Pangolin sends email with
    // CDK keeps the result in cdk.context.json, so run `npx cdk context --clear` after you create the user
    const smtpUserName = 'pangolin-smtp';
    const smtpUsers = cdk.ContextProvider.getValue(this, {
      provider: cxschema.ContextProvider.CC_API_PROVIDER,
      props: {
        typeName: 'AWS::IAM::User',
        exactIdentifier: smtpUserName,
        propertiesToReturn: ['Arn'],
      },
      dummyValue: [],
      mustExist: false,
    }).value;

    if (smtpUsers.length === 0) {
      new cdk.CfnOutput(this, 'CreateSmtpUser', {
        value: `The IAM user ${smtpUserName} does not exist. In the SES console (https://console.aws.amazon.com/ses/home?region=${this.region}), choose SMTP settings, select IAM SMTP credentials, and enter ${smtpUserName} as the user name. Then run "npx cdk context --clear"`,
      });
    }
  }
}
