const { 
  Client, 
  GatewayIntentBits, 
  SlashCommandBuilder, 
  Routes, 
  REST, 
  PermissionFlagsBits 
} = require('discord.js');

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages
  ]
});

/* ---------------- COMMANDS ---------------- */

const commands = [
  new SlashCommandBuilder().setName('kick').setDescription('Kick a user').addUserOption(o => o.setName('user').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
  new SlashCommandBuilder().setName('ban').setDescription('Ban a user').addUserOption(o => o.setName('user').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  new SlashCommandBuilder().setName('timeout').setDescription('Timeout a user').addUserOption(o => o.setName('user').setRequired(true)).addIntegerOption(o => o.setName('minutes').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName('clear').setDescription('Clear messages').addIntegerOption(o => o.setName('amount').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder().setName('help').setDescription('Show commands'),
  new SlashCommandBuilder().setName('support').setDescription('Support info'),
  new SlashCommandBuilder().setName('invite').setDescription('How to invite the bot'),
  new SlashCommandBuilder().setName('spawnercalculate').setDescription('Calculate spawner prices').addIntegerOption(o => o.setName('amount').setRequired(true)).addIntegerOption(o => o.setName('price').setRequired(true)),
  new SlashCommandBuilder().setName('diggingprice').setDescription('Calculate digging price').addIntegerOption(o => o.setName('height').setRequired(true)).addIntegerOption(o => o.setName('length').setRequired(true)).addIntegerOption(o => o.setName('width').setRequired(true)),
  new SlashCommandBuilder().setName('smokerprice').setDescription('Calculate total smoker farm cost').addIntegerOption(o => o.setName('amount').setRequired(true))
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
  console.log("Commands registered.");
})();

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;

  if (commandName === 'kick') { const member = interaction.options.getMember('user'); await member.kick(); return interaction.reply("User kicked."); }
  if (commandName === 'ban') { const member = interaction.options.getMember('user'); await member.ban(); return interaction.reply("User banned."); }
  if (commandName === 'timeout') { const member = interaction.options.getMember('user'); const minutes = interaction.options.getInteger('minutes'); await member.timeout(minutes*60*1000); return interaction.reply(`User timed out for ${minutes} minutes.`); }
  if (commandName === 'clear') { const amount = interaction.options.getInteger('amount'); await interaction.channel.bulkDelete(amount, true); return interaction.reply({ content:`Deleted ${amount} messages.`, ephemeral:true }); }
  if (commandName === 'help') { return interaction.reply("Commands: kick, ban, timeout, clear, help, support, invite, spawnercalculate, diggingprice, smokerprice"); }
  if (commandName === 'support') { return interaction.reply("For support, contact server staff."); }
  if (commandName === 'invite') { return interaction.reply("To invite this bot, DM @Flaminggmr."); }
  if (commandName === 'spawnercalculate') { const amount = interaction.options.getInteger('amount'); const price = interaction.options.getInteger('price'); const total = amount*price; const stack = 64*price; const half = 32*price; return interaction.reply(`Spawner Calculator:\nAmount: ${amount}\nPrice per spawner: ${price}\nTotal: ${total}\nStack (64): ${stack}\nHalf Stack (32): ${half}`); }
  if (commandName === 'diggingprice') { const h = interaction.options.getInteger('height'); const l = interaction.options.getInteger('length'); const w = interaction.options.getInteger('width'); const blocks = h*l*w; const total = blocks*1000; return interaction.reply(`Digging Calculator:\nDimensions: ${h}x${l}x${w}\nTotal Blocks: ${blocks}\nTotal Cost: ${total}`); }
  if (commandName === 'smokerprice') { const amount = interaction.options.getInteger('amount'); const total = amount*200000; return interaction.reply(`Smoker Farm Calculator:\nSmokers: ${amount}\nTotal Cost: ${total}`); }
});

client.login(TOKEN);
