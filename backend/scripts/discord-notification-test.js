const config = require("../lib/config");
const { sendDiscordIntegrationTestMessage } = require("../lib/services/discord-notification-service");

sendDiscordIntegrationTestMessage({ webhookUrl: config.ECHO_DISCORD_WEBHOOK_URL })
  .then(({ status }) => {
    process.stdout.write(`Discord integration test delivered (HTTP ${status}).\n`);
  })
  .catch((error) => {
    process.stderr.write("Discord integration test failed; webhook details were not logged.\n");
    process.exitCode = 1;
  });
