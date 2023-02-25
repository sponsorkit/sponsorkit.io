import { defineConfig, PlaywrightTestConfig } from '@playwright/test';

const PORT = process.env.PORT || 3000;

const baseURL = `http://localhost:${PORT}`;

const config: PlaywrightTestConfig = defineConfig({
  timeout: 10 * 60 * 1000,
  retries: 0,
  outputDir: 'test-results/',
  use: {
    baseURL,
    trace: 'retry-with-trace',
    headless: true,
    launchOptions: {
      headless: true
    }
  }
});

export default config;