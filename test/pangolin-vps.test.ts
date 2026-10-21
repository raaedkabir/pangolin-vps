// Add a test only for a problem that the `npx cdk deploy` command does not find.
// The problem must also cause the deployed application to fail.
// Test the connections between the resources, a property of the template, or the bootstrap script.
// Do not write configuration values (for example, ports, sizes, and names) again in the test.

import { execFileSync } from 'child_process';
import * as path from 'path';
import * as cdk from 'aws-cdk-lib/core';
import { Match, Template } from 'aws-cdk-lib/assertions';
import * as PangolinVps from '../lib/pangolin-vps-stack';

const vpsIp = '192.0.2.1';
const app = new cdk.App();
const stack = new PangolinVps.PangolinVpsStack(app, 'MyTestStack', {
  env: { account: '123456789012', region: 'ca-central-1' },
  vpsIp,
});
const template = Template.fromStack(stack);

const zones = template.findResources('AWS::Route53::HostedZone');
const [zoneId] = Object.keys(zones);
const zoneName = zones[zoneId].Properties.Name;

const [identityId] = Object.keys(template.findResources('AWS::SES::EmailIdentity'));

test('DNS records point at the VPS', () => {
  for (const name of [zoneName, `*.${zoneName}`]) {
    template.hasResourceProperties('AWS::Route53::RecordSet', {
      Name: name,
      Type: 'A',
      HostedZoneId: { Ref: zoneId },
      ResourceRecords: [vpsIp],
    });
  }
});

test('Parent zone delegates to the new hosted zone', () => {
  template.hasResourceProperties('AWS::Route53::RecordSet', {
    Name: zoneName,
    Type: 'NS',
    HostedZoneId: Match.not({ Ref: zoneId }),
    ResourceRecords: { 'Fn::GetAtt': [zoneId, 'NameServers'] },
  });
});

test('SES verifies the domain with DKIM records in the hosted zone', () => {
  for (const n of [1, 2, 3]) {
    template.hasResourceProperties('AWS::Route53::RecordSet', {
      Name: { 'Fn::GetAtt': [identityId, `DkimDNSTokenName${n}`] },
      Type: 'CNAME',
      HostedZoneId: { Ref: zoneId },
      ResourceRecords: [{ 'Fn::GetAtt': [identityId, `DkimDNSTokenValue${n}`] }],
    });
  }
});

test('Bootstrap script is valid bash', () => {
  execFileSync('bash', ['-n', path.join(__dirname, '..', 'scripts', 'bootstrap.sh')]);
});
