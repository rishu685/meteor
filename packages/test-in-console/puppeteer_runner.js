const puppeteer = require('../../dev_bundle/lib/node_modules/puppeteer');

let testNumber = 0;

async function runNextUrl(browser) {
  const page = await browser.newPage();

  // page.on('console', msg => {
  //   console.log('PAGE LOG:', msg.text());
  // });

  page.on('console', async msg => {
    // this is a way to make sure the travis does not timeout
    // if the test is running for too long without any output to the console (10 minutes)
    const text = msg.text();
    if (text.includes('Permissions policy violation')) {
      return;
    }
    if (msg._text !== undefined) console.log(msg._text);
    else {
      testNumber++;
      const currentClientTest =
       await page.evaluate(() => {
         if (typeof __Tinytest !== 'undefined' && __Tinytest._getCurrentRunningTestOnClient) {
           return __Tinytest._getCurrentRunningTestOnClient();
         }
         return '';
       });
      if (currentClientTest !== '') {
        console.log(`Currently running on the client test: ${ currentClientTest }`)
        return;
      }
      // If we get here is because we have not yet started the test on the client
      const currentServerTest =
       await page.evaluate(async () => {
         if (typeof __Tinytest !== 'undefined' && __Tinytest._getCurrentRunningTestOnServer) {
           return await __Tinytest._getCurrentRunningTestOnServer();
         }
         return '';
       });

      if (currentServerTest !== '') {
        console.log(`Currently running on the server test: ${ currentServerTest }`);
        return;
      }
      // we were not able to find the name of the test, this is a way to make sure the test is still running
      console.log(`Test number: ${ testNumber }`);
    }
  });

  if (!process.env.URL) {
    console.log('ERROR: URL environment variable not set');
    process.exit(1);
    return;
  }

  console.log('Loading test page at:', process.env.URL);
  
  try {
    await page.goto(process.env.URL, { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    console.log('Test page loaded successfully');
  } catch (error) {
    console.log('Error loading test page:', error.message);
    await page.close();
    await browser.close();
    process.exit(1);
  }

  let timedOut = false;
  // Enhanced timeout handling for CI environments
  let timeout = 60000; // Default 1 minute for local
  
  if (process.env.CI_TIMEOUT) {
    const parsedTimeout = parseInt(process.env.CI_TIMEOUT);
    if (!isNaN(parsedTimeout) && parsedTimeout > 0) {
      timeout = parsedTimeout;
      console.log('Using custom CI_TIMEOUT:', timeout / 1000, 'seconds');
    }
  } else if (process.env.TRAVIS) {
    timeout = 900000; // 15 minutes for Travis CI (extended)
    console.log('Using extended Travis CI timeout:', timeout / 1000, 'seconds');
  } else if (process.env.CIRCLECI) {
    timeout = 600000; // 10 minutes for CircleCI
    console.log('Using CircleCI timeout:', timeout / 1000, 'seconds');
  } else if (process.env.CI || process.env.GITHUB_ACTIONS) {
    timeout = 480000; // 8 minutes for other CI
    console.log('Using default CI timeout:', timeout / 1000, 'seconds');
  }
  
  console.log('Test timeout set to:', timeout / 1000, 'seconds');
  
  let timeoutHandle = setTimeout(() => {
    timedOut = true;
    console.log('Tests timed out after', timeout / 1000, 'seconds');
  }, timeout);

  async function poll() {
    if (timedOut) {
      console.log('Timeout reached, checking test status one final time...');
      try {
        let failCount = await getFailCount(page);
        console.log(`Tests timed out with ${ failCount } failures so far`);
      } catch (e) {
        console.log('Could not get final test status due to timeout');
      }
      try {
        if (!page.isClosed()) {
          await page.close();
        }
      } catch (e) {
        // Ignore page close errors after timeout
      }
      try {
        await browser.close();
      } catch (e) {
        // Ignore browser close errors after timeout
      }
      process.exit(1);
    }

    try {
      // Check if page is still connected before polling
      if (page.isClosed()) {
        console.log('Page was closed unexpectedly');
        await browser.close();
        process.exit(1);
      }

      if (await isDone(page)) {
        clearTimeout(timeoutHandle);
        let failCount = await getFailCount(page);
        console.log(`Tests complete with ${ failCount } failures`);
        console.log(`Tests complete with ${ await getPassCount(page) } passes`);
        if (failCount > 0) {
          const failed = await getFailed(page);
          failed.map((f) => console.log(`${ f.name } failed: ${ f.info }`));
          await page.close();
          await browser.close();
          process.exit(1);
        } else {
          await page.close();
          await browser.close();
          process.exit(0);
        }
      } else {
        setTimeout(poll, 1000);
      }
    } catch (error) {
      // Handle frame detachment and other navigation errors
      if (error.message.includes('detached Frame') || 
          error.message.includes('Session closed') ||
          error.message.includes('Target closed')) {
        console.log('Page navigation detected, attempting to continue...');
        // Try to wait for page to stabilize
        try {
          await page.waitForSelector('body', { timeout: 5000 });
        } catch (e) {
          // If we can't stabilize, exit
          console.log('Could not stabilize page after navigation');
          await browser.close();
          process.exit(1);
        }
      } else {
        console.log('Error during test polling:', error.message);
      }
      // Continue polling with longer delay
      setTimeout(poll, 2000);
    }
  }

  await poll();
}

/**
 *
 * @param page
 * @return {Promise<boolean>}
 */
async function isDone(page) {
  try {
    // Check if page is closed before attempting evaluation
    if (page.isClosed()) {
      return false;
    }
    
    return await page.evaluate(function () {
      if (typeof TEST_STATUS !== 'undefined') {
        return TEST_STATUS.DONE;
      }
      return typeof DONE !== 'undefined' && DONE;
    });
  } catch (error) {
    // Handle frame detachment gracefully
    if (error.message.includes('detached Frame') || 
        error.message.includes('Session closed') ||
        error.message.includes('Target closed')) {
      console.log('Frame detached while checking test completion status');
      return false; // Assume not done if we can't check
    }
    console.log('Error checking if tests are done:', error.message);
    return false;
  }
}

/**
 *
 * @param page
 * @return {Promise<number>}
 */
async function getPassCount(page) {
  try {
    // Check if page is closed before attempting evaluation
    if (page.isClosed()) {
      return 0;
    }
    
    return await page.evaluate(function () {
      if (typeof TEST_STATUS !== 'undefined') {
        return TEST_STATUS.PASSED;
      }
      return typeof PASSED !== 'undefined' && PASSED;
    });
  } catch (error) {
    // Handle frame detachment gracefully
    if (error.message.includes('detached Frame') || 
        error.message.includes('Session closed') ||
        error.message.includes('Target closed')) {
      console.log('Frame detached while getting pass count');
      return 0;
    }
    console.log('Error getting pass count:', error.message);
    return 0;
  }
}

/**
 *
 * @param page
 * @return {Promise<number>}
 */
async function getFailCount(page) {
  try {
    // Check if page is closed before attempting evaluation
    if (page.isClosed()) {
      return -1;
    }
    
    return await page.evaluate(function () {
      if (typeof TEST_STATUS !== 'undefined') {
        return TEST_STATUS.FAILURES;
      }
      return typeof FAILURES !== 'undefined' && FAILURES;
    });
  } catch (error) {
    // Handle frame detachment gracefully
    if (error.message.includes('detached Frame') || 
        error.message.includes('Session closed') ||
        error.message.includes('Target closed')) {
      console.log('Frame detached while getting fail count');
      return -1;
    }
    console.log('Error getting fail count:', error.message);
    return -1; // Return -1 to indicate error
  }
}

/**
 *
 * @param page
 * @return {Promise<[{name: string, info: string}]>}
 */
async function getFailed(page) {
  try {
    // Check if page is closed before attempting evaluation
    if (page.isClosed()) {
      return [];
    }
    
    return await page.evaluate(function () {
      if (typeof TEST_STATUS !== 'undefined') {
        return TEST_STATUS.WHERE_FAILED;
      }
      return typeof WHERE_FAILED !== 'undefined' && WHERE_FAILED;
    });
  } catch (error) {
    // Handle frame detachment gracefully
    if (error.message.includes('detached Frame') || 
        error.message.includes('Session closed') ||
        error.message.includes('Target closed')) {
      console.log('Frame detached while getting failed tests');
      return [];
    }
    console.log('Error getting failed tests:', error.message);
    return [];
  }
}

async function runTests() {
  console.log(`Running test with Puppeteer at ${process.env.URL}`);

  // Enhanced arguments for better CI compatibility, especially Travis CI
  const launchArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-web-security',
    '--disable-dev-shm-usage', // Overcome limited resource problems in CI
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--memory-pressure-off'  // Disable memory pressure warnings in CI
  ];

  // Additional Travis CI specific arguments
  if (process.env.TRAVIS) {
    launchArgs.push(
      '--disable-features=TranslateUI',
      '--disable-ipc-flooding-protection',
      '--disable-web-resources',
      '--disable-background-networking',
      '--disable-sync',
      '--metrics-recording-only',
      '--no-report-upload'
    );
  }

  // --no-sandbox and --disable-setuid-sandbox must be disabled for CI compatibility
  const browser = await puppeteer.launch({
    args: launchArgs,
    headless: "new",
    timeout: 30000,
  });
  
  console.log(`Using Puppeteer version: ${await browser.version()}`);
  console.log('Browser launch arguments:', launchArgs.join(' '));
  
  try {
    await runNextUrl(browser);
  } catch (error) {
    console.log('Error during test execution:', error.message);
    await browser.close();
    process.exit(1);
  }
}

runTests().catch((e) =>
  console.log(`something broke while running puppeter: `, e)
);
