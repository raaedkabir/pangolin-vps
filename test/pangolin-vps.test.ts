// Add a test only for a problem that the `npx cdk deploy` command does not find.
// The problem must also cause the deployed application to fail.
// Test the connections between the resources or a property of the template.
// Do not write configuration values (for example, ports, sizes, and names) again in the test.

import { execFileSync } from 'child_process';
import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import * as PangolinVps from '../lib/pangolin-vps-stack';

const app = new cdk.App();
const stack = new PangolinVps.PangolinVpsStack(app, 'MyTestStack', {
  env: { account: '123456789012', region: 'ca-central-1' },
});
const template = Template.fromStack(stack);

const zones = template.findResources('AWS::Route53::HostedZone');
const [zoneId] = Object.keys(zones);
const zoneName = zones[zoneId].Properties.Name;

test('Instance uses the security group', () => {
  const [securityGroupId] = Object.keys(template.findResources('AWS::EC2::SecurityGroup'));
  template.hasResourceProperties('AWS::EC2::Instance', {
    SecurityGroupIds: [{ 'Fn::GetAtt': [securityGroupId, 'GroupId'] }],
  });
});

test('DNS records point at the Elastic IP attached to the instance', () => {
  const [instanceId] = Object.keys(template.findResources('AWS::EC2::Instance'));
  const [eipId] = Object.keys(template.findResources('AWS::EC2::EIP'));
  template.hasResourceProperties('AWS::EC2::EIP', { InstanceId: { Ref: instanceId } });

  for (const name of [zoneName, `*.${zoneName}`]) {
    template.hasResourceProperties('AWS::Route53::RecordSet', {
      Name: name,
      Type: 'A',
      HostedZoneId: { Ref: zoneId },
      ResourceRecords: [{ 'Fn::GetAtt': [eipId, 'PublicIp'] }],
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

test('User data is valid bash', () => {
  const [instance] = Object.values(template.findResources('AWS::EC2::Instance'));
  execFileSync('bash', ['-n'], { input: instance.Properties.UserData['Fn::Base64'] });
});

test('AMI is pinned so new Ubuntu releases do not replace the instance', () => {
  // A pinned AMI ID is a plain string; one looked up from SSM on every deploy is a Ref to a parameter
  const [instance] = Object.values(template.findResources('AWS::EC2::Instance'));
  expect(typeof instance.Properties.ImageId).toBe('string');
});
