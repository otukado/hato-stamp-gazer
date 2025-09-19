import {
  Api,
  Client,
  type ChannelList,
  type DMChannel,
  type Stamp,
} from "traq-bot-ts";
import Axios from "axios";
import _ from "lodash";

const api = new Api({
  baseApiParams: { headers: { Authorization: `Bearer ${process.env.TOKEN}` } },
});
const client = new Client({ token: process.env.TOKEN });

const traqing = Axios.create({
  baseURL: "https://traqing.cp20.dev/api",
  headers: {
    Cookie: `traq-auth-token=${process.env.TRAQ_AUTH_TOKEN}`,
  },
  withCredentials: true,
});

// traqing.interceptors.request.use((request) => {
//   console.log("Request: ", {
//     url: request.url,
//     params: request.params,
//   });
//   return request;
// });

// traqing.interceptors.response.use((response) => {
//   console.log("Response: ", response.data);
//   return response;
// });

client.listen(() => {
  console.log("Listening...");
});

const FETCH_INTERVAL_MS: number = 10 * 60 * 1000;

const STAMP_IDS = [
  "01980754-cd9d-7362-8f32-713249662413", // o_o_fake
  "01976a21-6a11-715d-9f20-a45ecaea4688", // hato
  "0197c5ea-e884-7b50-a8f6-23998164ad96", // hato_kourin
] as const;

const TARGET_USER_ID = "019623b2-9ccc-7ba8-b7c6-14664b78f093";

const MESSAGE = (stampName: string, channelPaths: string[]) =>
  `${channelPaths.join(
    ", "
  )} に :${stampName}: が押された投稿があります :choo-choo-train-nya:`;

type StampCountList = Record<(typeof STAMP_IDS)[number], number>;
type ChannelStampCountList = Record<string, number>;
type ChannelStampCountLists = Record<
  (typeof STAMP_IDS)[number],
  ChannelStampCountList
>;

let channelIds: string[];
let stampCountList: StampCountList;
let channelStampCountLists: ChannelStampCountLists;
const targetChannelId = await getDmChannelId(TARGET_USER_ID);

await setup();

function promiseSequential<T>(promises: (() => Promise<T>)[]) {
  return promises.reduce((acc, cur) => {
    return acc.then(async (arr) => [...arr, await cur()]);
  }, Promise.resolve([] as T[]));
}

function promiseSemiSequential<T>(promises: (() => Promise<T>)[], size = 100) {
  return promiseSequential(
    _.chunk(promises, size).map(
      (chunk) => () => Promise.all(chunk.map((promise) => promise()))
    )
  ).then((result) => result.flat(1));
}

function getChannels() {
  return api.channels
    .getChannels()
    .then((response) => response.json() as Promise<ChannelList>)
    .then((channelList) => channelList.public);
}

async function getChannelIds() {
  return (
    await getChannels().then((channels) => channels.map(({ id }) => id))
  );
}

async function getDmChannelId(userId: string) {
  return api.users
    .getUserDmChannel(userId)
    .then((response) => response.json() as Promise<DMChannel>)
    .then(({ id }) => id);
}

async function getStampName(stampId: string) {
  return api.stamps
    .getStamp(stampId)
    .then((response) => response.json() as Promise<Stamp>)
    .then(({ name }) => name);
}

async function getChannelPath(channelId: string) {
  return api
    .request<{ path: string }, void>({
      path: `/channels/${channelId}/path`,
      method: "GET",
      secure: true,
      format: "json",
    })
    .then((response) => response.json() as any)
    .then(({ path }) => path as string);
}

async function getStampCount(
  stampId: string,
  channelId?: string
): Promise<number> {
  const result = await traqing.get(`/stamps`, {
    params: {
      stampId,
      channelId,
      isBot: false,
      order: "asc",
      limit: 1001,
      offset: 0,
      after: new Date(0),
      before: new Date(),
    },
  });

  return result.data[0].count;
}

async function getStampCountList(channelId?: string): Promise<StampCountList> {
  return Object.fromEntries(
    await Promise.all(
      STAMP_IDS.map(async (stampId) => [
        stampId,
        await getStampCount(stampId, channelId),
      ])
    )
  );
}

async function getChannelStampCountList(
  stampId: string
): Promise<ChannelStampCountList> {
  return Object.fromEntries(
    await promiseSemiSequential(
      channelIds.map((channelId) => {
        return async () => [channelId, await getStampCount(stampId, channelId)];
      })
    )
  );
}

async function getChannelStampCountLists(): Promise<ChannelStampCountLists> {
  return Object.fromEntries(
    await Promise.all(
      STAMP_IDS.map(async (stampId) => [
        stampId,
        await getChannelStampCountList(stampId),
      ])
    )
  );
}

function compareStampCountLists(
  previous: StampCountList,
  current: StampCountList
) {
  return STAMP_IDS.filter((stampId) => previous[stampId] < current[stampId]);
}

function compareChannelStampCountList(
  previous: ChannelStampCountList,
  current: ChannelStampCountList
) {
  return channelIds.filter((channelId) => {
    return previous[channelId]! < current[channelId]!;
  });
}

async function setup() {
  console.log("setup");

  channelIds = await getChannelIds();

  console.log(channelIds);

  stampCountList = await getStampCountList();
  channelStampCountLists = await getChannelStampCountLists();

  setInterval(main, FETCH_INTERVAL_MS);
}

async function main() {
  console.log("main");

  const currentStampCountList = await getStampCountList();
  // currentStampCountList[STAMP_IDS[0]] += 1;

  const addedStampIds = compareStampCountLists(
    stampCountList,
    currentStampCountList
  );
  stampCountList = currentStampCountList;

  addedStampIds.forEach(async (stampId) => {
    const currentChannelStampCountList = await getChannelStampCountList(
      stampId
    );
    // currentChannelStampCountList[channelIds[0]!]! += 1;

    const addedChannelIds = compareChannelStampCountList(
      channelStampCountLists[stampId],
      currentChannelStampCountList
    );
    channelStampCountLists[stampId] = currentChannelStampCountList;

    const stampName = await getStampName(stampId);
    const channelPaths = await Promise.all(
      addedChannelIds.map(
        async (channelId) =>
          await getChannelPath(channelId).then((path) => `#${path}`)
      )
    );

    await api.channels.postMessage(targetChannelId, {
      content: MESSAGE(stampName, channelPaths),
      embed: true,
    });
  });
}

client.on("MESSAGE_CREATED", async ({ body }) => {
  const {
    user: { name },
    plainText,
    channelId,
    createdAt,
  } = body.message;
  if (!plainText.includes("ping")) return;

  const ping = Date.now() - createdAt.getTime();

  const message = `@${name} pong! (${ping}ms)`;

  console.log(`Sending message: ${message}`);

  await api.channels.postMessage(channelId, { content: message, embed: true });
});
