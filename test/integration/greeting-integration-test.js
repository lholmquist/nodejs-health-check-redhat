'use strict';

const test = require('tape');
const supertest = require('supertest');
const rhoaster = require('rhoaster');

const util = require('util');
const setTimeoutPromise = util.promisify(setTimeout);

const packagejson = require('../../package.json');

const testEnvironment = rhoaster({
  deploymentName: packagejson.name,
  dockerImage: 'registry.access.redhat.com/rhoar-nodejs/nodejs-8'
});

testEnvironment.deploy()
  .then(runTests)
  .then(_ => test.onFinish(testEnvironment.undeploy))
  .catch(console.error);

function runTests (route) {
  test('/api/greeting', t => {
    t.plan(1);
    supertest(route)
      .get('/api/greeting')
      .expect(200)
      .expect('Content-Type', /json/)
      .then(response => {
        t.equal(response.body.content, 'Hello, World!', 'should return the Hello, World Greeting');
        t.end();
      });
  });

  test('/api/greeting with query param', t => {
    t.plan(1);
    supertest(route)
      .get('/api/greeting?name=luke')
      .expect(200)
      .expect('Content-Type', /json/)
      .then(response => {
        t.equal(response.body.content, 'Hello, luke', 'should return the Hello, luke Greeting');
        t.end();
      });
  });

  test('/api/health/readiness returns OK', async t => {
    // wait the initial 60 seconds before the liveness probe kicks in.
    await setTimeoutPromise(60000);
    supertest(route)
      .get('/api/health/readiness')
      .expect(200)
      .expect('Content-Type', 'text/html')
      .then(response => {
        t.equal(response.text, 'OK', 'should return OK');
        // Now shut the endpoint down
        return supertest(route)
          .get('/api/stop')
          .expect(200);
      })
      .then(response => {
        t.equal(response.text, 'Stopping HTTP server', 'should be stopping the server');
        // check that the greeting is down
        return supertest(route)
          .get('/api/greeting')
          .expect(503);
      })
      .then(response => {
        t.equal(response.statusCode, 503, 'shold have a 400 response');
        // Now ping the liveness probe which should return a 50x response
        return supertest(route)
          .get('/api/health/liveness')
          .expect(500);
      })
      .then(response => {
        t.equal(response.statusCode, 500, 'shold have a 500 response');
      })
      .then(_ => {
        // wait until the app is back up
        return setTimeoutPromise(20000);
      }).then(_ => {
        // After we wait check the app again
        supertest(route)
          .get('/api/greeting')
          .expect(200)
          .expect('Content-Type', /json/)
          .then(response => {
            t.equal(response.body.content, 'Hello, World!', 'should return the Hello, World Greeting');
            t.end();
          });
      });
  });
}
