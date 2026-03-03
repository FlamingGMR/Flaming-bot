const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [

    new SlashCommandBuilder()
        .setName('spawner')
        .setDescription('Calculate total spawner price')
        .addStringOption(option =>
            option.setName('count')
                .setDescription('Number of spawners (ex: 5k)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('price')
                .setDescription('Price per spawner (ex: 200k)')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('spawnerprice')
        .setDescription('Set base price per spawner')
        .addStringOption(option =>
            option.setName('price')
                .setDescription('New price (ex: 200k)')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('smoker')
        .setDescription('Calculate smoker value')
        .addStringOption(option =>
            option.setName('count')
                .setDescription('Number of smokers')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('giveaway')
        .setDescription('Manage giveaways')
        .addSubcommand(sub =>
            sub.setName('create')
                .setDescription('Create giveaway')
                .addStringOption(opt =>
                    opt.setName('prize')
                        .setDescription('Prize')
                        .setRequired(true))
                .addIntegerOption(opt =>
                    opt.setName('duration')
                        .setDescription('Duration in seconds')
                        .setRequired(true)))
        .addSubcommand(sub =>
            sub.setName('end')
                .setDescription('End giveaway')
                .addStringOption(opt =>
                    opt.setName('id')
                        .setDescription('Giveaway ID')
                        .setRequired(true))),

    new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Warn a member')
        .addUserOption(opt =>
            opt.setName('user')
                .setDescription('User to warn')
                .setRequired(true))
        .addStringOption(opt =>
            opt.setName('reason')
                .setDescription('Reason')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Ban a member')
        .addUserOption(opt =>
            opt.setName('user')
                .setDescription('User to ban')
                .setRequired(true))
        .addStringOption(opt =>
            opt.setName('reason')
                .setDescription('Reason')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('timeout')
        .setDescription('Timeout a member')
        .addUserOption(opt =>
            opt.setName('user')
                .setDescription('User to timeout')
                .setRequired(true))
        .addIntegerOption(opt =>
            opt.setName('duration')
                .setDescription('Duration in seconds')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('untimeout')
        .setDescription('Remove timeout')
        .addUserOption(opt =>
            opt.setName('user')
                .setDescription('User')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('unban')
        .setDescription('Unban a member')
        .addStringOption(opt =>
            opt.setName('userid')
                .setDescription('User ID')
                .setRequired(true))

].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);


(async () => {
    try {
        console.log('Registering commands...');
        await rest.put(
            Routes.applicationGuildCommands('1477661953882329179', '1468260183619932173'),
            { body: commands }
        );
        console.log('Commands registered successfully.');
    } catch (error) {
        console.error(error);
    }
})();
