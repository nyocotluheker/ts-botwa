
const handler = async (m, { reply }) => {
  reply("Pong!");
};

handler.command = ["ping"];
handler.help = ["ping"];
handler.tags = ["utility"];

export default handler;