// command/menu.ts
import os from 'os';
import config from '../system/config.ts';
import { runtime, formatSize } from '../system/utils.ts';
import { getPlugins, setMenuUpdateCallback } from '../handlers.ts';

let pluginsList: any[] = [];

// Callback dari handler untuk update plugins
setMenuUpdateCallback((plugins: any[]) => {
  pluginsList = plugins;
});

export default {
  command: ['menu', 'help'],
  
  async execute(m: any, plug: any) {
    const { prefix, reply } = plug;
    
    // Info sistem
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    
    // KUMPULIN SEMUA COMMAND DARI PLUGIN
    const categories: { [key: string]: string[] } = {
      'Main': [],
      'Group': [],
      'Owner': [],
      'Private': [],
      'Other': []
    };
    
    // Ambil dari pluginsList yang udah diupdate dari handler
    const currentPlugins = pluginsList.length > 0 ? pluginsList : getPlugins();
    
    for (const plugin of currentPlugins) {
      if (plugin?.command && Array.isArray(plugin.command)) {
        // Format command dengan prefix
        const cmdList = plugin.command.map((c: string) => `${prefix}${c}`).join(' | ');
        
        // Kategorisasi
        let category = 'Other';
        if (plugin.group) category = 'Group';
        else if (plugin.owner) category = 'Owner';
        else if (plugin.private) category = 'Private';
        else if (!plugin.group && !plugin.private && !plugin.owner) category = 'Main';
        
        // Tambahin ke kategori
        if (!categories[category]) {
          categories[category] = [];
        }
        categories[category].push(`▢ ${cmdList}`);
      }
    }
    
    // Buat menu text
    let menuText = `╭─❒ *MENU BOT*\n│\n`;
    menuText += `├─❒ ⚡ Speed: ${Date.now() - (m.messageTimestamp || 0) * 1000}ms\n`;
    menuText += `├─❒ ⏰ Runtime: ${runtime(process.uptime())}\n`;
    menuText += `├─❒ 💾 RAM: ${formatSize(usedMem)} / ${formatSize(totalMem)}\n`;
    menuText += `│\n`;
    
    // Tampilkan per kategori (urutin)
    const categoryOrder = ['Main', 'Group', 'Private', 'Owner', 'Other'];
    for (const cat of categoryOrder) {
      if (categories[cat] && categories[cat].length > 0) {
        menuText += `├─❒ *${cat}*\n`;
        menuText += categories[cat].map(cmd => `│  ${cmd}`).join('\n') + '\n';
        menuText += `│\n`;
      }
    }
    
    menuText += `╰─❒ ${config.settings?.footer || 'Bot WhatsApp'}`;
    
    await reply(menuText);
  }
};