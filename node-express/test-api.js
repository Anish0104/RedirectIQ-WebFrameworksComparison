// Runs a sequential axios-based smoke test against the local RedirectIQ API.
const axios = require('axios');
const { once } = require('events');
const { startServer } = require('./src/server');

const HOST = '127.0.0.1';
const DEFAULT_PASSWORD = 'password123';

function createClient(baseUrl) {
  return axios.create({
    baseURL: baseUrl,
    validateStatus: function validateStatus() {
      return true;
    },
    maxRedirects: 0
  });
}

function logResponse(response) {
  console.log('Status:', response.status);
  console.log('Data:', response.data);
}

async function resolveBaseUrl() {
  const configuredBaseUrl = (process.env.BASE_URL || '').trim().replace(/\/$/, '');

  if (configuredBaseUrl) {
    return {
      baseUrl: configuredBaseUrl,
      close: async function closeConfiguredBaseUrl() {}
    };
  }

  const server = startServer({
    host: HOST,
    port: 0
  });

  await once(server, 'listening');

  const address = server.address();
  const baseUrl = `http://${HOST}:${address.port}`;

  return {
    baseUrl,
    close: async function closeStartedServer() {
      await new Promise(function closeServer(resolve, reject) {
        server.close(function onClose(error) {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  };
}

async function runTests() {
  const email = `redirectiq-smoke-${Date.now()}@test.com`;
  const customSlug = `smoke${Date.now().toString().slice(-6)}`;
  const credentials = {
    email,
    password: DEFAULT_PASSWORD
  };
  const { baseUrl, close } = await resolveBaseUrl();
  const client = createClient(baseUrl);

  try {
    let token;
    let slug;

    console.log(`Running smoke test against ${baseUrl}`);

    console.log('--- TEST 1: Register ---');
    const registerResponse = await client.post('/auth/register', credentials);
    logResponse(registerResponse);

    console.log('--- TEST 2: Login ---');
    const loginResponse = await client.post('/auth/login', credentials);
    logResponse(loginResponse);
    token = loginResponse.data && loginResponse.data.token;

    if (!token) {
      throw new Error('No token returned from login');
    }

    console.log('--- TEST 3: Create Link ---');
    const createLinkResponse = await client.post(
      '/links',
      {
        original_url: 'https://google.com',
        custom_slug: customSlug
      },
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );
    logResponse(createLinkResponse);
    slug = createLinkResponse.data && createLinkResponse.data.slug;

    if (!slug) {
      throw new Error('No slug returned from link creation');
    }

    console.log('--- TEST 4: List Links ---');
    const listLinksResponse = await client.get('/links', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    logResponse(listLinksResponse);

    console.log('--- TEST 5: Redirect By Slug ---');
    const redirectResponse = await client.get(`/${slug}`);
    console.log('Status:', redirectResponse.status);
    console.log('Location:', redirectResponse.headers.location || null);

    console.log('--- TEST 6: Stats Summary ---');
    const statsResponse = await client.get('/stats/summary', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    logResponse(statsResponse);
  } finally {
    await close();
  }
}

runTests()
  .catch(function handleError(error) {
    if (error.response) {
      console.error('Request failed with response:');
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
      return;
    }

    console.error('Test run failed:', error && (error.stack || error.message || error));
  })
  .finally(function finish() {
    console.log('ALL TESTS DONE');
  });
