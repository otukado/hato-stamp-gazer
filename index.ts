import { Api, Client } from 'traq-bot-ts';

const api = new Api({
  baseApiParams: { headers: { Authorization: `Bearer ${process.env.TOKEN}` } },
});
const client = new Client({ token: process.env.TOKEN });


const obj = {
    name: "sora",
    age: "25",
    like: {
        food: "apple"
    }
}


client.on('MESSAGE_CREATED', async ({ body }) => {
  const {
    user: { name },
    plainText,
    channelId,
    createdAt,
  } = body.message;
  if (!plainText.includes('ping')) return;

  const ping = Date.now() - createdAt.getTime();

  const message = `@${name} pong! (${ping}ms)`;

  console.log(`Sending message: ${message}`);

  await api.channels.postMessage(channelId, { content: message, embed: true });
});

client.listen(() => {
  console.log('Listening...');
});