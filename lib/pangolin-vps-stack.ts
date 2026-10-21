import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as route53 from 'aws-cdk-lib/aws-route53';

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
  }
}
