// Part 1: Imports, client setup, collections, and helpers
console.log("Bot file started loading...");
console.log("INDEX FILE STARTED");
process.on('unhandledRejection', console.error);
process.on('uncaughtException', console.error);
const { Client, GatewayIntentBits, Collection, EmbedBuilder } = require('discord.js');
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const fs = require('fs');
const path = require('path');

// Create the Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions
    ]
});

// Collections for commands, cooldowns, giveaways
client.commands = new Collection();
client.cooldowns = new Collection();
client.giveaways = new Collection();

// When the bot is ready
client.once('ready', () => {
    console.log(`${client.user.tag} is online!`);
});

// ---------------- Helper Functions ----------------

// Parse numbers with shortcuts (k, m, b)
function parseNumber(input) {
    if (typeof input === 'number') return input;
    input = input.toString().toLowerCase().trim();

    let multiplier = 1;
    if (input.endsWith('k')) {
        multiplier = 1_000;
        input = input.slice(0, -1);
    } else if (input.endsWith('m')) {
        multiplier = 1_000_000;
        input = input.slice(0, -1);
    } else if (input.endsWith('b')) {
        multiplier = 1_000_000_000;
        input = input.slice(0, -1);
    }

    const parsed = parseFloat(input);
    if (isNaN(parsed)) return 0;
    return parsed * multiplier;
}

// Format numbers for clean embed display
function formatNumber(num) {
    if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(2) + 'B';
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + 'M';
    if (num >= 1_000) return (num / 1_000).toFixed(2) + 'K';
    return num.toString();
}

// Create a generic embed for messages
function createEmbed(title, description, color = '#00FFFF') {
    return new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color);
}

// Giveaway storage
const giveaways = new Collection();

// Smoker base value (per your system)
const SMOKER_BASE = 200_000; // 200k per smoker

// Part 2: Moderation Commands (all using embeds)

// Part 3: Spawner Calculator & Smoker Commands

// Use the existing giveaways collection from Part 1
// No redeclaration of parseRewardInput; define once
function parseRewardInput(input) {
    if (typeof input === 'number') return input;
    const str = input.toString().toLowerCase().trim();
    let multiplier = 1;
    if (str.endsWith('k')) { multiplier = 1_000; str = str.slice(0, -1); }
    else if (str.endsWith('m')) { multiplier = 1_000_000; str = str.slice(0, -1); }
    else if (str.endsWith('b')) { multiplier = 1_000_000_000; str = str.slice(0, -1); }
    const num = parseFloat(str);
    return isNaN(num) ? 0 : num * multiplier;
}

// --- Spawner Calculator ---
function calculateSpawnerPrice(countInput, priceInput) {
    const count = parseRewardInput(countInput);
    const price = parseRewardInput(priceInput);
    const total = count * price;

    let totalDisplay;
    if (total >= 1_000_000_000) totalDisplay = (total / 1_000_000_000).toFixed(2) + 'B';
    else if (total >= 1_000_000) totalDisplay = (total / 1_000_000).toFixed(2) + 'M';
    else if (total >= 1_000) totalDisplay = (total / 1_000).toFixed(2) + 'K';
    else totalDisplay = total.toString();

    const embed = new EmbedBuilder()
        .setTitle('Spawner Price Calculator')
        .setColor('#FFA500')
        .addFields(
            { name: 'Spawner Count', value: `${countInput} (${count})`, inline: true },
            { name: 'Price per Spawner', value: `${priceInput} (${price})`, inline: true },
            { name: 'Total Price', value: `${totalDisplay}`, inline: false }
        );

    return embed;
}

// --- Smoker Command ---
function calculateSmoker(userId, amountInput) {
    const amount = parseRewardInput(amountInput);
    const totalValue = amount * 200_000; // 200k per smoker
    const totalDisplay = totalValue >= 1_000_000 ? (totalValue / 1_000_000).toFixed(2) + 'M' : totalValue.toString();

    const embed = new EmbedBuilder()
        .setTitle('Smoker Calculation')
        .setColor('#00FF00')
        .addFields(
            { name: 'User', value: `<@${userId}>`, inline: true },
            { name: 'Smokers', value: amountInput, inline: true },
            { name: 'Total Value', value: totalDisplay, inline: false }
        );

    return embed;
}

// --- Interaction Listener for Part 3 ---
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, user } = interaction;

    if (commandName === 'spawner') {
        const count = options.getString('count');
        const price = options.getString('price');
        const embed = calculateSpawnerPrice(count, price);
        await interaction.reply({ embeds: [embed] });
    }

    if (commandName === 'smoker') {
        const amount = options.getString('amount'); // how many smokers
        const embed = calculateSmoker(user.id, amount);
        await interaction.reply({ embeds: [embed] });
    }
});

// Part 4: Giveaway Commands

// Helper: create giveaway embed
function createGiveawayEmbed(giveawayId, prize, duration) {
    return new EmbedBuilder()
        .setTitle('🎉 Giveaway! 🎉')
        .setColor('#FFD700')
        .addFields(
            { name: 'Giveaway ID', value: giveawayId, inline: true },
            { name: 'Prize', value: prize, inline: true },
            { name: 'Duration', value: `${duration} seconds`, inline: true }
        )
        .setFooter({ text: 'React with 🎉 to join!' });
}

// Helper: end giveaway
function endGiveawayById(giveawayId) {
    if (!giveaways.has(giveawayId)) return null;
    const g = giveaways.get(giveawayId);
    if (!g.participants || g.participants.length === 0) return null;

    const winnerId = g.participants[Math.floor(Math.random() * g.participants.length)];
    const embed = new EmbedBuilder()
        .setTitle('🎉 Giveaway Ended! 🎉')
        .setColor('#00FF00')
        .setDescription(`<@${winnerId}> won **${g.prize}**!`);
    
    giveaways.delete(giveawayId);
    return embed;
}

// Helper: user joins giveaway
function joinGiveaway(userId, giveawayId) {
    if (!giveaways.has(giveawayId)) return false;
    const g = giveaways.get(giveawayId);
    if (!g.participants) g.participants = [];
    if (!g.participants.includes(userId)) g.participants.push(userId);
    return true;
}

// --- Interaction Listener for Giveaways ---
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, user } = interaction;

    if (commandName === 'giveaway') {
        const sub = options.getSubcommand();

        if (sub === 'create') {
            const prize = options.getString('prize');
            const duration = parseRewardInput(options.getString('duration')); // seconds
            const gId = Date.now().toString();

            giveaways.set(gId, { prize, duration, participants: [] });

            const embed = createGiveawayEmbed(gId, prize, duration);
            await interaction.reply({ embeds: [embed], ephemeral: true });

        } else if (sub === 'join') {
            const gId = options.getString('id');
            const success = joinGiveaway(user.id, gId);
            if (success) await interaction.reply({ content: 'You joined the giveaway!', ephemeral: true });
            else await interaction.reply({ content: 'Giveaway not found.', ephemeral: true });

        } else if (sub === 'end') {
            const gId = options.getString('id');
            const embed = endGiveawayById(gId);
            if (embed) await interaction.reply({ embeds: [embed] });
            else await interaction.reply({ content: 'No such giveaway or no participants.', ephemeral: true });
        }
    }
});

// ==================== Part 5: Command Handler, Spawner, Smoker, Giveaway ====================

// --- Unified interactionCreate handler ---
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, user, guild, member } = interaction;

    // ==================== Giveaway Commands ====================
    if (commandName === 'giveaway') {
        const sub = options.getSubcommand();
        if (sub === 'create') {
            const prize = options.getString('prize');
            const duration = parseRewardInput(options.getString('duration'));
            const gId = Date.now().toString();
            giveaways.set(gId, { prize, duration, participants: [] });

            const embed = new EmbedBuilder()
                .setTitle('Giveaway Created!')
                .setDescription(`Prize: **${prize}**\nDuration: **${duration} seconds**`)
                .setColor('#FFD700')
                .setFooter({ text: 'React to join!' });

            await interaction.reply({ embeds: [embed], ephemeral: true });
        } else if (sub === 'end') {
            const gId = options.getString('id');
            const embed = endGiveaway(gId);
            if (embed) await interaction.reply({ embeds: [embed] });
            else await interaction.reply('No such giveaway or no participants.');
        }
    }

    // ==================== Dork Game ====================
    if (commandName === 'dork') {
        const choice = options.getString('choice');
        const amount = options.getString('amount'); // Use numeric shortcut parsing
        const result = endDork(user.id, choice, amount);

        if (result) {
            const embed = new EmbedBuilder()
                .setTitle('Dork Game Result')
                .setDescription(result.message)
                .setColor(result.newGame ? '#00FF00' : '#FF9900');

            await interaction.reply({ embeds: [embed] });
        }
    }

    // ==================== Smoker Game ====================
    if (commandName === 'spawner') {
    const sub = options.getSubcommand(); // 'calc' or 'change'
    if (sub === 'calc') {
        const count = options.getString('count');
        const price = options.getString('price');
        const total = parseNumber(count) * parseNumber(price);
        const embed = new EmbedBuilder()
            .setTitle('Spawner Price')
            .setDescription(`**Spawners:** ${count}\n**Price per Spawner:** ${price}\n**Total:** ${total}`)
            .setColor('#FFA500');
        await interaction.reply({ embeds: [embed] });
    } else if (sub === 'change') {
        const newPrice = options.getString('price');
        client.spawnerPrice = parseNumber(newPrice);
        await interaction.reply({ content: `Spawner price updated to ${newPrice}`, ephemeral: true });
    }
}


    // ==================== Spawner Price ====================
    if (commandName === 'spawner') {
        const spawnerCount = options.getString('count');
        const pricePerSpawner = options.getString('price');
        const total = parseRewardInput(spawnerCount) * parseRewardInput(pricePerSpawner);

        const displayTotal =
            total >= 1_000_000_000 ? (total / 1_000_000_000).toFixed(2) + 'B' :
            total >= 1_000_000 ? (total / 1_000_000).toFixed(2) + 'M' :
            total >= 1_000 ? (total / 1_000).toFixed(2) + 'K' :
            total.toString();

        const embed = new EmbedBuilder()
            .setTitle('Spawner Price Calculator')
            .setDescription(
                `**Spawners:** ${spawnerCount}\n**Price per Spawner:** ${pricePerSpawner}\n**Total:** ${displayTotal}`
            )
            .setColor('#FFA500');

        await interaction.reply({ embeds: [embed] });
    }

    // ==================== Moderation ====================
    if (['warn', 'ban', 'unban', 'timeout', 'untimeout'].includes(commandName)) {
        let target = options.getUser('user') || null;
        let reason = options.getString('reason') || 'No reason provided';
        let targetMember = target ? guild.members.cache.get(target.id) : null;

        if (commandName === 'warn') {
            const msg = await warnMember(targetMember, reason);
            const embed = new EmbedBuilder().setTitle('Warn').setDescription(msg).setColor('#FF9900');
            await interaction.reply({ embeds: [embed] });
        }

        if (commandName === 'ban') {
            const days = options.getInteger('days') || 0;
            const msg = await banMember(targetMember, reason, days);
            const embed = new EmbedBuilder().setTitle('Ban').setDescription(msg).setColor('#FF0000');
            await interaction.reply({ embeds: [embed] });
        }

        if (commandName === 'unban') {
            const userId = options.getString('user_id');
            const msg = await unbanMember(guild, userId);
            const embed = new EmbedBuilder().setTitle('Unban').setDescription(msg).setColor('#00FF00');
            await interaction.reply({ embeds: [embed] });
        }

        if (commandName === 'timeout') {
            const duration = parseRewardInput(options.getString('duration')) * 1000; // ms
            const msg = await timeoutMember(targetMember, duration, reason);
            const embed = new EmbedBuilder().setTitle('Timeout').setDescription(msg).setColor('#FF9900');
            await interaction.reply({ embeds: [embed] });
        }

        if (commandName === 'untimeout') {
            const msg = await removeTimeout(targetMember, reason);
            const embed = new EmbedBuilder().setTitle('Remove Timeout').setDescription(msg).setColor('#00FF00');
            await interaction.reply({ embeds: [embed] });
        }
    }

    // ==================== Role Management ====================
    if (['addrole', 'removerole'].includes(commandName)) {
        const target = options.getUser('user');
        const role = options.getRole('role');
        const targetMember = guild.members.cache.get(target.id);
        let success;

        if (commandName === 'addrole') success = await addRole(targetMember, role);
        if (commandName === 'removerole') success = await removeRole(targetMember, role);

        const embed = new EmbedBuilder()
            .setTitle(commandName === 'addrole' ? 'Add Role' : 'Remove Role')
            .setDescription(success ? 'Operation successful.' : 'Failed.')
            .setColor(success ? '#00FF00' : '#FF0000');

        await interaction.reply({ embeds: [embed] });
    }
});
// -------- SLASH COMMAND REGISTRATION --------

const commands = [

    new SlashCommandBuilder()
        .setName('smoker')
        .setDescription('Calculate smoker profit')
        .addStringOption(option =>
            option.setName('amount')
                .setDescription('Number of smokers (supports k/m)')
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName('spawner')
        .setDescription('Calculate spawner total price')
        .addStringOption(option =>
            option.setName('count')
                .setDescription('Number of spawners (supports k/m)')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('price')
                .setDescription('Price per spawner (supports k/m)')
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName('embed')
        .setDescription('Send a custom embed')
        .addStringOption(option =>
            option.setName('title')
                .setDescription('Embed title')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('description')
                .setDescription('Embed description')
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Warn a user')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to warn')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason')
                .setRequired(false)
        ),

    new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Ban a user')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to ban')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason')
                .setRequired(false)
        ),

    new SlashCommandBuilder()
        .setName('timeout')
        .setDescription('Timeout a user')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to timeout')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('duration')
                .setDescription('Duration in seconds (supports k/m)')
                .setRequired(true)
        ),

].map(command => command.toJSON());


// REGISTER COMMANDS
const rest = new REST({ version: '10' }).setToken("MTQ3NzY2MTk1Mzg4MjMyOTE3OQ.G022mR.EGd0dv2YJ44MSwvWV-VcuTpoFnJxyG7HZHjpaw");

(async () => {
    try {
        console.log('Registering slash commands...');
        await rest.put(
            Routes.applicationCommands("1477661953882329179"),
            { body: commands }
        );
        console.log('Slash commands registered successfully.');
    } catch (error) {
        console.error(error);
    }
})();

	client.login("MTQ3NzY2MTk1Mzg4MjMyOTE3OQ.G022mR.EGd0dv2YJ44MSwvWV-VcuTpoFnJxyG7HZHjpaw");
 .then(() => console.log("Login successful"))
  .catch(err => console.error(err));

