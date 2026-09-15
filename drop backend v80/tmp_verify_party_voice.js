const assert = require('assert');
const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');

const partyRoutes = require('./routes/party.js');
const xmpp = require('./xmpp/xmpp.js');

function makeAccessToken(sub) {
  return 'eg1~' + jwt.sign({ sub, creation_date: new Date(), hours_expire: 24 }, 'secret');
}

(async () => {
  const app = express();
  app.use(express.json());

  const accessToken = makeAccessToken('alice');
  const captainToken = makeAccessToken('bob');
  global.accessTokens = [{ token: accessToken }, { token: captainToken }];
  global.vcParticipants = {};
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
      invites: [],
      revision: 0,
      intentions: []
    }
  };

  require('./model/user.js').findOne = () => ({ lean: async () => ({ accountId: 'alice', banned: false }) });
  require('./model/friends.js').findOne = () => ({ cache: async () => ({ list: { accepted: [] } }) });

  app.use(partyRoutes);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const { port } = server.address();
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
      headers: { authorization: `bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ providers: { rtcp: {} } })
    });
    assert.strictEqual(vcResponse.status, 200, 'voice chat connection route should succeed');

    const vcBody = await vcResponse.json();
    assert.ok(vcBody.providers && vcBody.providers.rtcp && vcBody.providers.rtcp.room_name === 'room-123', 'rtc room name should be returned');
    assert.ok(Array.isArray(global.vcParticipants.p1), 'vcParticipants should be initialized');
    assert.ok(global.vcParticipants.p1.some((member) => member.puid === 'bob'), 'captain should be included in the vc member list');
    assert.ok(global.vcParticipants.p1.some((member) => member.puid === 'alice'), 'member should be included in the vc member list');

    const disconnected = xmpp.handlePartyMemberDisconnect('alice');
    assert.strictEqual(disconnected, true, 'disconnect handler should report removing a member');
    assert.strictEqual(global.parties.p1.members.some((member) => member.account_id === 'alice'), false, 'offline user should be removed from the party');
    assert.ok(!global.vcParticipants.p1.some((member) => member.puid === 'alice'), 'offline user should be removed from vc participants');

    console.log('tmp_verify_party_voice: PASS');
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    setTimeout(() => process.exit(0), 50);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
