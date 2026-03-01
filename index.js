const { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder } = require('discord.js');
require('dotenv').config();

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages],
    partials: [Partials.Channel],
});

// Slash commands
const commands = [
    new SlashCommandBuilder()
        .setName('help')
        .setDescription('Shows a list of commands'),
    new SlashCommandBuilder()
        .setName('support')
        .setDescription('Get support info'),
    new SlashCommandBuilder()
        .setName('invite')
        .setDescription('Information to invite the bot'),
    new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Kick a user from the server')
        .addUserOption(o => o.setName('user').setDescription('The user to kick').setRequired(true)),
    new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Ban a user from the server')
        .addUserOption(o => o.setName('user').setDescription('The user to ban').setRequired(true)),
    new SlashCommandBuilder()
        .setName('timeout')
        .setDescription('Timeout a user for a duration in minutes')
        .addUserOption(o => o.setName('user').setDescription('The user to timeout').setRequired(true))
        .addIntegerOption(o => o.setName('minutes').setDescription('Minutes of timeout').setRequired(true)),
    new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Clear a number of messages')
        .addIntegerOption(o => o.setName('amount').setDescription('Number of messages to delete').setRequired(true)),
    new SlashCommandBuilder()
        .setName('spawnercalculate')
        .setDescription('Calculate spawner prices')
        .addIntegerOption(o => o.setName('amount').setDescription('Number of spawners').setRequired(true))
        .addIntegerOption(o => o.setName('price').setDescription('Price per spawner').setRequired(true)),
    new SlashCommandBuilder()
        .setName('diggingprice')
        .setDescription('Calculate digging price for an area')
        .addIntegerOption(o => o.setName('length').setDescription('Length in blocks').setRequired(true))
        .addIntegerOption(o => o.setname('width').setDescription('Width in blocks').setRequired(true))
        .addIntegerOption(o => o.setName('height').setDescription('Height in blocks').setRequired(true)),
    new SlashCommandBuilder()
        .setName('smokerprice')
        .setDescription('Calculate total price for smokers')
        .addIntegerOption(o => o.setName('amount').setDescription('Number of smokers').setRequired(true)),
].map(command => command.toJSON());

// Register commands
const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
    try {
        console.log('Registering commands...');
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands }
        );
        console.log('Commands registered.');
    } catch (error) {
        console.error(error);
    }
})();

// Command handling
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    try {
        if (commandName === 'help') {
            await interaction.reply('Available commands: /help, /support, /invite, /kick, /ban, /timeout, /clear, /spawnercalculate, /diggingprice, /smokerprice');
        } else if (commandName === 'support') {
            await interaction.reply('DM @FlamingGMR for support.');
        } else if (commandName === 'invite') {
            await interaction.reply('To invite this bot, DM @FlamingGMR.');
        } else if (commandName === 'kick') {
            const user = interaction.options.getUser('user');
            const member = interaction.guild.members.cache.get(user.id);
            if (!member) return interaction.reply('User not found.');
            await member.kick();
            await interaction.reply(`${user.tag} has been kicked.`);
        } else if (commandName === 'ban') {
            const user = interaction.options.getUser('user');
            const member = interaction.guild.members.cache.get(user.id);
            if (!member) return interaction.reply('User not found.');
            await member.ban();
            await interaction.reply(`${user.tag} has been banned.`);
        } else if (commandName === 'timeout') {
            const user = interaction.options.getUser('user');
            const minutes = interaction.options.getInteger('minutes');
            const member = interaction.guild.members.cache.get(user.id);
            if (!member) return interaction.reply('User not found.');
            await member.timeout(minutes * 60 * 1000);
            await interaction.reply(`${user.tag} has been timed out for ${minutes} minutes.`);
        } else if (commandName === 'clear') {
            const amount = interaction.options.getInteger('amount');
            const messages = await interaction.channel.messages.fetch({ limit: amount });
            await interaction.channel.bulkDelete(messages);
            await interaction.reply(`${amount} messages deleted.`).then(msg => setTimeout(() => msg.delete(), 5000));
        } else if (commandName === 'spawnercalculate') {
            const amount = interaction.options.getInteger('amount');
            const price = interaction.options.getInteger('price');
            const total = amount * price;
            const perStack = total / 64;
            const perHalfStack = total / 32;
            await interaction.reply(`Total: $${total}\nPrice per stack: $${perStack}\nPrice per half stack: $${perHalfStack}`);
        } else if (commandName === 'diggingprice') {
            const length = interaction.options.getInteger('length');
            const width = interaction.options.getInteger('width');
            const height = interaction.options.getInteger('height');
            const total = length * width * height * 1000;
            await interaction.reply(`Digging price: $${total}`);
        } else if (commandName === 'smokerprice') {
            const amount = interaction.options.getInteger('amount');
            const total = amount * 200000;
            await interaction.reply(`Total price for smokers: $${total}`);
        }
    } catch (error) {
        console.error(error);
        await interaction.reply({ content: 'There was an error executing this command.', ephemeral: true });
    }
});

client.login(process.env.TOKEN);

