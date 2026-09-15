const assert = require('assert');
const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');

const partyRoutes = require('../routes/party.js');
const xmpp = require('../xmpp/xmpp.js');

function makeAccessToken(sub) {
  return 'eg1~' + jwt.sign({ sub, creation_date: new Date(), hours_expire: 24 }, 'secret');
}

async function main() {
  const app = express();
  app.use(express.json());

  const accessToken = makeAccessToken('alice');
  const captainToken = makeAccessToken('bob');
  global.accessTokens = [{ token: accessToken }, { token: captainToken }];
  global.parties = {
    p1: {
      id: 'p1',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      config: { max_size: 16, joinability: 'OPEN' },
      members: [
        { account_id: 'bob', meta: { 'urn:epic:member:dn_s': 'Bob' }, connections: [], revision: 0, updated_at: new Date().toISOString(), joined_at: new Date().toISOString(), role: 'CAPTAIN' },
        { account_id: 'alice', meta: { 'urn:epic:member:dn_s': 'Alice' }, connections: [], revision: 0, updated_at: new Date().toISOString(), joined_at: new Date().toISOString(), role: 'MEMBER' }
      ],
      applicants: [],
      meta: {},
      invites: [
        { party_id: 'p1', sent_by: 'bob', sent_to: 'alice', sent_at: new Date().toISOString(), updated_at: new Date().toISOString(), expires_at: new Date(Date.now() + 3600000).toISOString(), status: 'SENT' }
      ],
      revision: 0,
      intentions: [
        { requester_id: 'bob', requestee_id: 'alice', requester_dn: 'Bob', expires_at: new Date(Date.now() + 3600000).toISOString(), sent_at: new Date().toISOString() }
      ]
    }
  };

  require('../model/user.js').findOne = () => ({ lean: async () => ({ accountId: 'alice', banned: false }) });
  require('../model/friends.js').findOne = () => ({ cache: async () => ({ list: { accepted: [] } }) });

  app.use(partyRoutes);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const { port } = server.address();

    const userResponse = await fetch(`http://127.0.0.1:${port}/party/api/v1/Fortnite/user/alice`, {
      headers: { authorization: `bearer ${accessToken}` }
    });
    assert.strictEqual(userResponse.status, 200, 'GET user should succeed');
    const userBody = await userResponse.json();
    assert.strictEqual(Array.isArray(userBody.invites), true, 'invites should be an array');
    assert.strictEqual(userBody.invites.length, 1, 'invite should be exposed to the user');
    assert.strictEqual(Array.isArray(userBody.pending), true, 'pending should be an array');
    assert.strictEqual(userBody.pending.length, 1, 'join request should be exposed to the user');

    const notificationsResponse = await fetch(`http://127.0.0.1:${port}/party/api/v1/Fortnite/user/alice/notifications/undelivered/count`, {
      headers: { authorization: `bearer ${accessToken}` }
    });
    assert.strictEqual(notificationsResponse.status, 200, 'notifications count route should succeed');
    const notificationsBody = await notificationsResponse.json();
    assert.strictEqual(notificationsBody.invites, 1, 'undelivered notification count should include invites');
    assert.strictEqual(notificationsBody.pending, 1, 'undelivered notification count should include pending join requests');

    const intentionResponse = await fetch(`http://127.0.0.1:${port}/party/api/v1/Fortnite/user/alice/intentions/bob`, {
      method: 'POST',
      headers: {
        authorization: `bearer ${accessToken}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({})
    });
    assert.strictEqual(intentionResponse.status, 200, 'request join route should exist');
    const intentionBody = await intentionResponse.json();
    assert.strictEqual(intentionBody.requestee_id, 'alice', 'join request should target the correct account');

    const originalPost = require('axios').post;
    require('axios').post = async (url, data, config) => {
      if (url.includes('/auth/v1/oauth/token')) {
        return { data: { access_token: 'rtc-token', token_type: 'bearer', expires_at: new Date(Date.now() + 3600000).toISOString() } };
      }
      if (url.includes('/rtc/v1/')) {
        return { data: { roomId: 'room-123', clientBaseUrl: 'https://rtc.example', participants: [{ puid: 'alice', token: 'alice-token' }] } };
      }
      return originalPost(url, data, config);
    };

    const vcResponse = await fetch(`http://127.0.0.1:${port}/party/api/v1/Fortnite/parties/p1/members/alice/conferences/connection`, {
      method: 'POST',
      headers: {
        authorization: `bearer ${accessToken}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ providers: { rtcp: {} } })
    });
    assert.strictEqual(vcResponse.status, 200, 'voice chat connection route should succeed');
    const vcBody = await vcResponse.json();
    assert.strictEqual(vcBody.providers && vcBody.providers.rtcp && vcBody.providers.rtcp.room_name, 'room-123', 'rtc room id should be returned');
    assert.strictEqual(vcBody.providers.rtcp.participant_token, 'alice-token', 'rtc participant token should be returned');

    const kickResponse = await fetch(`http://127.0.0.1:${port}/party/api/v1/Fortnite/parties/p1/members/alice`, {
      method: 'DELETE',
      headers: {
        authorization: `bearer ${captainToken}`,
        'content-type': 'application/json'
      }
    });
    assert.strictEqual(kickResponse.status, 204, 'captain should be able to kick a party member');
    assert.strictEqual(global.parties.p1.members.some((member) => member.account_id === 'alice'), false, 'member should be removed from party after kick');

    global.parties = {
      p2: {
        id: 'p2',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        config: { max_size: 16, joinability: 'OPEN' },
        members: [
          { account_id: 'bob', meta: { 'urn:epic:member:dn_s': 'Bob' }, connections: [], revision: 0, updated_at: new Date().toISOString(), joined_at: new Date().toISOString(), role: 'CAPTAIN' },
          { account_id: 'alice', meta: { 'urn:epic:member:dn_s': 'Alice' }, connections: [], revision: 0, updated_at: new Date().toISOString(), joined_at: new Date().toISOString(), role: 'MEMBER' }
        ],
        applicants: [],
        meta: {},
        invites: [],
        revision: 0,
        intentions: []
      }
    };

    xmpp.handlePartyMemberDisconnect?.('alice');
    assert.strictEqual(global.parties.p2.members.some((member) => member.account_id === 'alice'), false, 'offline user should leave the party automatically');
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
