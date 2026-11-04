const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const { App } = require('aws-cdk-lib');
const { Template } = require('aws-cdk-lib/assertions');
const { NomNomGoStack } = require('../lib/stack');

test('Event API uses standalone code and filters real-shaped publish events', () => {
  const outdir = mkdtempSync(path.join(tmpdir(), 'nom-nom-stack-'));
  try {
    const stack = new NomNomGoStack(new App({ outdir }), 'TestStack', { env: { region: 'eu-central-1' } });
    const template = Template.fromStack(stack);
    template.resourceCountIs('AWS::AppSync::DataSource', 0);
    template.resourceCountIs('AWS::AppSync::ChannelNamespace', 1);
    const namespace = Object.values(template.findResources('AWS::AppSync::ChannelNamespace'))[0];
    assert.equal(namespace.Properties.HandlerConfigs, undefined);
    const onPublish = vm.runInNewContext(
      namespace.Properties.CodeHandlers.replace('export function', 'function') + '\nonPublish',
    );
    const events = ['snapshot', 'event', 'beat', 'hello', 'glove', 'cheer', 'unknown'].map((type) => ({
      id: type, payload: { v: 1, type },
    }));
    events.push(
      { id: 'wrong-version', payload: { v: 2, type: 'beat' } },
      { id: 'missing-payload' },
      { id: 'oversized', payload: { v: 1, type: 'beat', data: 'x'.repeat(4096) } },
    );
    for (const [role, expected] of [['play', ['snapshot', 'event', 'beat']], ['dad', ['beat', 'hello', 'glove', 'cheer']]]) {
      const result = onPublish({ info: { channel: { path: `/kitchen/test/${role}`, segments: ['kitchen', 'test', role] } }, events });
      assert.deepEqual(Array.from(result, (event) => event.id), expected);
      assert.ok(result.every((event) => events.includes(event)), 'Forward original event IDs and payloads');
    }
    template.hasResourceProperties('Custom::CDKBucketDeployment', {
      SystemMetadata: { 'cache-control': 'public, max-age=31536000, immutable' },
    });
    template.hasResourceProperties('Custom::CDKBucketDeployment', {
      SystemMetadata: { 'cache-control': 'no-cache' },
    });
  } finally {
    rmSync(outdir, { recursive: true, force: true });
  }
});
