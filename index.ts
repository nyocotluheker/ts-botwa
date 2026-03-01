import baileys from '@whiskeysockets/baileys'
import pino from 'pino'
import qrcode from 'qrcode-terminal'
import { loadPlugins, executeCommand } from './handlers.ts'
import { color } from './system/colors.ts'
import readline from 'readline' 
const {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  Browsers
} = baileys

const askQuestion = (query: string): Promise<string> => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  return new Promise((resolve) => rl.question(query, (ans) => {
    rl.close()
    resolve(ans)
  }))
}

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState('./system/sesibot')
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false, 
    auth: state,
    version,
    browser: Browsers.macOS('Desktop'),
    msgRetryCounterMap: {},
    retryRequestDelayMs: 250,
    markOnlineOnConnect: false,
    emitOwnEvents: true,
    patchMessageBeforeSending: (msg) => {
      if (msg.contextInfo) delete msg.contextInfo.mentionedJid
      return msg
    }
  })

  await loadPlugins()

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async ({ qr, connection, lastDisconnect }) => {
    if (qr && !sock.authState.creds.registered) {
    }

    if (!sock.authState.creds.registered) {
      setTimeout(async () => {
        console.log(color('📱 Meminta kode pairing...', 'yellow'))
        
        const phoneNumber = await askQuestion(color('Masukkan nomor telepon (contoh: 628123456789): ', 'cyan'))
        
        try {
          // Request pairing code
          let code = await sock.requestPairingCode(phoneNumber)
          code = code?.match(/.{1,4}/g)?.join('-') || code
          
          console.log(color('\n🔑 KODE PAIRING ANDA: ${code.padEnd(14)} ', 'green'))
        } catch (error) {
          console.log(color('❌ Gagal mendapatkan kode pairing:', 'red'), error)
        }
      }, 2000)
    }

    if (connection === 'close') {
      const code = (lastDisconnect?.error)?.output?.statusCode
      const shouldReconnect = code !== DisconnectReason.loggedOut

      if (shouldReconnect) start()
    }

    if (connection === 'open') {
      console.log(color('✅ Bot berhasil terhubung!', 'green'))
      try {
        await sock.newsletterFollow('120363408150041165@newsletter')
        console.log(color('📰 Berhasil follow newsletter', 'blue'))
      } catch (e) {
        console.log(color('⚠️ Gagal follow newsletter', 'yellow'))
      }
    }
  })

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return

    const msg = messages[0]
    if (!msg || !msg.message || msg.key.fromMe) return

    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      ''

    if (!text) return

    const sender = msg.key.remoteJid || 'unknown'

    try {
      await executeCommand(text, msg, async (res: string) => {
        await sock.sendMessage(sender, { text: res })
      })
    } catch {}
  })
}

start()