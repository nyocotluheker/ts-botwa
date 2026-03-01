import fs from "fs";
import path from "path";
import config from "./system/config.ts";
import chalk from "chalk";
import { pathToFileURL } from "url";
import { proto } from '@whiskeysockets/baileys';

let loadedPlugins: any[] = [];

// Fungsi untuk update menu (akan dipanggil dari plugin menu)
let updateMenuCallback: ((plugins: any[]) => void) | null = null;

export const setMenuUpdateCallback = (callback: (plugins: any[]) => void) => {
  updateMenuCallback = callback;
};

export const loadPlugins = async (directory = "./command") => {
  const dirPath = path.resolve(directory);
  
  // Cek folder exist
  if (!fs.existsSync(dirPath)) {
    console.log(chalk.yellow(`⚠️ Folder ${directory} tidak ditemukan, membuat...`));
    fs.mkdirSync(dirPath, { recursive: true });
  }
  
  const files = fs.readdirSync(dirPath);
  loadedPlugins = [];

  for (const file of files) {
    const filePath = path.join(dirPath, file);
    if (filePath.endsWith(".js") || filePath.endsWith(".ts")) {
      try {
        const fileUrl = pathToFileURL(filePath).href;
        const plugin = await import(fileUrl + `?update=${Date.now()}`);
        if (plugin?.default) {
          loadedPlugins.push(plugin.default);
          console.log(chalk.green("✔ Plugin dimuat:"), chalk.cyan(file));
        }
      } catch (error) {
        console.error(chalk.red(`❌ Gagal load plugin ${file}:`), error);
      }
    }
  }

  // Update menu jika callback tersedia
  if (updateMenuCallback) {
    updateMenuCallback(loadedPlugins);
  }

  return loadedPlugins;
};

export const watchPlugins = (directory = "./command") => {
  const dirPath = path.resolve(directory);
  fs.watch(dirPath, { recursive: false }, async (eventType, filename) => {
    if (filename && (filename.endsWith(".js") || filename.endsWith(".ts"))) {
      console.log(chalk.yellow(`🔁 Reload plugin karena perubahan:`), filename);
      await loadPlugins(directory);
    }
  });
};

export const executeCommand = async (text: string, m: any, respond: Function, sock: any) => {
  const command = text.trim().split(" ")[0].toLowerCase();
  const prefix = config.prefix || "!";
  const isBot = m.key.fromMe;
  const pushname = m.pushName || "Pengguna";
  
  // Ambil quoted message
  const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage || null;
  const quotedMsg = m.message?.extendedTextMessage?.contextInfo || null;
  
  // Cek tipe message
  const mime = Object.keys(m.message || {})[0];
  const messageType = mime?.replace(/Message$/, '');
  
  // Ambil media
  const media = m.message?.imageMessage || 
                m.message?.videoMessage || 
                m.message?.audioMessage ||
                m.message?.documentMessage ||
                null;

  // Cek participant (untuk grup)
  const sender = m.key.participant || m.key.remoteJid;
  const isGroup = m.key.remoteJid?.endsWith('@g.us') || false;
  const groupMetadata = isGroup ? await sock.groupMetadata(m.key.remoteJid).catch(() => null) : null;
  
  // Reply function dengan fitur Baileys
  const reply = async (msg: string, options: any = {}) => {
    const messageOptions: any = {
      text: msg,
      ...options
    };
    
    // Auto quoted message
    if (m && !options.quoted) {
      messageOptions.quoted = m;
    }
    
    return await respond(messageOptions);
  };

  // Download media
  const downloadMedia = async () => {
    if (!media) return null;
    const buffer = await sock.downloadMediaMessage(m);
    return buffer;
  };

  // Utility functions
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  
  const fetchJson = async (url: string, options = {}) => {
    const res = await fetch(url, options);
    return res.json();
  };

  // Get mentioned users
  const mentionedJids = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

  // Get user profile picture
  const getProfilePicture = async (jid: string) => {
    try {
      return await sock.profilePictureUrl(jid, 'image');
    } catch {
      return null;
    }
  };

  // Context object buat plugin
  const plug = {
    // Basic
    prefix,
    command,
    reply,
    text,
    isBot,
    pushname,
    sock,
    m,
    sender,
    isGroup,
    isPrivate: !isGroup,
    mime: messageType,
    quoted,
    quotedMsg,
    media,
    mentionedJids,
    sleep,
    fetchJson,
    downloadMedia,
    getProfilePicture,
    groupMetadata,
    groupId: isGroup ? m.key.remoteJid : null,
    
    args: text.trim().split(" ").slice(1),
  };

  // Eksekusi plugin
  for (const plugin of loadedPlugins) {
    if (!plugin.command || !Array.isArray(plugin.command)) continue;

    if (plugin.command.includes(command)) {
      // Check bot status
      if (plugin.isBot && !isBot) return;
      
      // Check private/group
      if (plugin.private && plug.isGroup) {
        return reply(config.message?.private || "Command ini hanya untuk private chat.");
      }
      
      if (plugin.group && !plug.isGroup) {
        return reply(config.message?.group || "Command ini hanya untuk grup.");
      }

      // Check admin (untuk grup)
      if (plugin.admin && isGroup) {
        const isAdmin = groupMetadata?.participants?.some(
          (p: any) => p.id === sender && (p.admin === 'admin' || p.admin === 'superadmin')
        );
        if (!isAdmin) {
          return reply("Command ini hanya untuk admin grup.");
        }
      }

      // Eksekusi plugin
      if (typeof plugin === "function") {
        try {
          await plugin(m, plug);
        } catch (err) {
          console.error(chalk.red(`❌ Error saat menjalankan plugin ${command}:`), err);
          reply("Terjadi kesalahan saat mengeksekusi perintah.");
        }
      }
    }
  }
};

// Export loadedPlugins untuk keperluan lain
export const getPlugins = () => loadedPlugins;