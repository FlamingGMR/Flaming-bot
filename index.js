// Part 1: Imports, client, collections, ready event
const { Client, GatewayIntentBits, Collection, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Create client
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
    // Load commands dynamically if needed here
});

// Part 2: Moderation commands

// Warn command
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, member, guild } = interaction;

    if (commandName === 'warn') {
        const user = options.getUser('user');
        const reason = options.getString('reason') || 'No reason provided';

        if (!member.permissions.has('ModerateMembers')) {
            return interaction.reply({ content: 'You do not have permission to warn members.', ephemeral: true });
        }

        // Log the warning (simple file log)
        const warnLog = `${user.tag} was warned by ${member.user.tag} for: ${reason}\n`;
        fs.appendFileSync('warns.txt', warnLog);

        return interaction.reply({ content: `${user} has been warned for: ${reason}` });
    }

    // Ban command
    if (commandName === 'ban') {
        const user = options.getUser('user');
        const reason = options.getString('reason') || 'No reason provided';

        if (!member.permissions.has('BanMembers')) {
            return interaction.reply({ content: 'You do not have permission to ban members.', ephemeral: true });
        }

        const memberToBan = guild.members.cache.get(user.id);
        if (!memberToBan) return interaction.reply({ content: 'Member not found.', ephemeral: true });

        await memberToBan.ban({ reason });
        return interaction.reply({ content: `${user} has been banned. Reason: ${reason}` });
    }

    // Timeout command
    if (commandName === 'timeout') {
        const user = options.getUser('user');
        const duration = options.getInteger('duration') || 60; // default 60s
        const memberToTimeout = guild.members.cache.get(user.id);

        if (!member.permissions.has('ModerateMembers')) {
            return interaction.reply({ content: 'You do not have permission to timeout members.', ephemeral: true });
        }

        await memberToTimeout.timeout(duration * 1000, 'Timeout command');
        return interaction.reply({ content: `${user} has been timed out for ${duration} seconds.` });
    }

    // Unban command
    if (commandName === 'unban') {
        const userId = options.getString('user_id');

        if (!member.permissions.has('BanMembers')) {
            return interaction.reply({ content: 'You do not have permission to unban members.', ephemeral: true });
        }

        await guild.members.unban(userId);
        return interaction.reply({ content: `User with ID ${userId} has been unbanned.` });
    }

    // Untimeout command
    if (commandName === 'untimeout') {
        const user = options.getUser('user');
        const memberToUntimeout = guild.members.cache.get(user.id);

        if (!member.permissions.has('ModerateMembers')) {
            return interaction.reply({ content: 'You do not have permission to remove timeout.', ephemeral: true });
        }

        await memberToUntimeout.timeout(null);
        return interaction.reply({ content: `${user} has been removed from timeout.` });
    }
});

// Part 3: Number Shortcuts, Spawner Calculator, Giveaway Join, and Embeds


// Helper: parse numbers with shortcuts k, m, b
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
    if (isNaN(parsed)) return null;
    return parsed * multiplier;
}

// Spawner Calculator
function calculateSpawner(totalSpawners, pricePerSpawner) {
    const total = parseNumber(totalSpawners) * parseNumber(pricePerSpawner);
    let result;

    if (total >= 1_000_000_000) result = (total / 1_000_000_000).toFixed(2) + 'B';
    else if (total >= 1_000_000) result = (total / 1_000_000).toFixed(2) + 'M';
    else if (total >= 1_000) result = (total / 1_000).toFixed(2) + 'K';
    else result = total.toString();

    return result;
}

// Giveaway storage
const giveaways = new Collection();

// Example function: user joins giveaway
function joinGiveaway(userId, giveawayId) {
    if (!giveaways.has(giveawayId)) return false;
    const g = giveaways.get(giveawayId);
    if (!g.participants) g.participants = [];
    if (!g.participants.includes(userId)) g.participants.push(userId);
    return true;
}

// Giveaway embed
function createGiveawayEmbed(title, duration, prize) {
    return new EmbedBuilder()
        .setTitle(title)
        .addFields(
            { name: 'Duration', value: duration.toString(), inline: true },
            { name: 'Prize', value: prize.toString(), inline: true }
        )
        .setColor('#FFD700')
        .setFooter({ text: 'React to join!' });
}

// Smoker/dork game reward parsing with shortcuts
function parseRewardInput(input) {
    const parsed = parseNumber(input);
    if (parsed === null) return 0;
    return parsed;
}

// Example usage
const spawnerTotal = calculateSpawner('5k', '2.5k'); // 5,000 spawners × 2,500 each
console.log('Spawner Total:', spawnerTotal); // Should print: 12.50M
// Part 4: Giveaway End, Dork Game, Roles, and Moderation

// Giveaway end logic
function endGiveaway(giveawayId) {
    if (!giveaways.has(giveawayId)) return null;
    const g = giveaways.get(giveawayId);

    if (!g.participants || g.participants.length === 0) return null;

    // Pick a random winner
    const winnerId = g.participants[Math.floor(Math.random() * g.participants.length)];
    const winnerMention = `<@${winnerId}>`;

    const embed = new EmbedBuilder()
        .setTitle('Giveaway Ended!')
        .setDescription(`${winnerMention} won **${g.prize}**!`)
        .setColor('#00FF00');

    giveaways.delete(giveawayId);
    return embed;
}

// Dork game logic
function endDork(userId, choice, prize) {
    let finalPrize = parseRewardInput(prize);

    if (choice.toLowerCase() === 'double') {
        finalPrize *= 2;
        return {
            message: `<@${userId}> chose **double**! Prize doubled to ${finalPrize}`,
            newGame: true
        };
    } else if (choice.toLowerCase() === 'keep') {
        return {
            message: `<@${userId}> chose **keep** and won ${finalPrize}`,
            newGame: false
        };
    }
    return null;
}

// Role management
async function addRole(member, role) {
    try {
        await member.roles.add(role);
        return true;
    } catch {
        return false;
    }
}

async function removeRole(member, role) {
    try {
        await member.roles.remove(role);
        return true;
    } catch {
        return false;
    }
}

// Moderation commands
async function warnMember(member, reason) {
    return `${member.user.tag} was warned. Reason: ${reason}`;
}

async function banMember(member, reason, days = 0) {
    try {
        await member.ban({ reason, days });
        return `${member.user.tag} has been banned. Reason: ${reason}`;
    } catch (e) {
        return `Failed to ban ${member.user.tag}. Error: ${e.message}`;
    }
}

async function unbanMember(guild, userId) {
    try {
        await guild.members.unban(userId);
        return `<@${userId}> has been unbanned.`;
    } catch (e) {
        return `Failed to unban <@${userId}>. Error: ${e.message}`;
    }
}

async function timeoutMember(member, durationMs, reason) {
    try {
        await member.timeout(durationMs, reason);
        return `${member.user.tag} has been timed out for ${durationMs}ms. Reason: ${reason}`;
    } catch (e) {
        return `Failed to timeout ${member.user.tag}. Error: ${e.message}`;
    }
}

async function removeTimeout(member, reason) {
    try {
        await member.timeout(null, reason);
        return `${member.user.tag} timeout removed. Reason: ${reason}`;
    } catch (e) {
        return `Failed to remove timeout for ${member.user.tag}. Error: ${e.message}`;
    }
}
// Part 5: Smoker Game, Spawner Calculator, Command Handler, and Shortcuts

// --- Helper for numeric shortcuts ---
function parseRewardInput(input) {
    if (typeof input === 'number') return input;
    const str = input.toString().toLowerCase().trim();
    if (str.endsWith('k')) return parseFloat(str) * 1000;
    if (str.endsWith('m')) return parseFloat(str) * 1000000;
    if (str.endsWith('b')) return parseFloat(str) * 1000000000;
    return parseFloat(str);
}

// Smoker game logic
function playSmoker(userId, betAmount) {
    const bet = parseRewardInput(betAmount);
    const outcomes = ['win', 'lose'];
    const result = outcomes[Math.floor(Math.random() * outcomes.length)];
    const prize = result === 'win' ? bet * 2 : 0;

    const embed = new EmbedBuilder()
        .setTitle('Smoker Game')
        .setDescription(
            `<@${userId}> bet ${betAmount} and ${result === 'win' ? 'won' : 'lost'} ${prize}`
        )
        .setColor(result === 'win' ? '#00FF00' : '#FF0000');

    return { result, prize, embed };
}

// Spawner price calculator
function calculateSpawnerPrice(spawnerCount, pricePerSpawner) {
    const count = parseRewardInput(spawnerCount);
    const price = parseRewardInput(pricePerSpawner);
    const total = count * price;

    const embed = new EmbedBuilder()
        .setTitle('Spawner Price Calculator')
        .setDescription(
            `**Spawners:** ${count}\n**Price per Spawner:** ${price}\n**Total:** ${total}`
        )
        .setColor('#FFA500');

    return { total, embed };
}

// --- Command Handler ---
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, user, guild, member } = interaction;

    // Giveaway commands
    if (commandName === 'giveaway') {
        const sub = options.getSubcommand();
        if (sub === 'create') {
            const prize = options.getString('prize');
            const duration = parseRewardInput(options.getString('duration'));
            const gId = Date.now().toString();
            giveaways.set(gId, { prize, duration, participants: [] });
            await interaction.reply({ content: `Giveaway created for ${prize}!`, ephemeral: true });
        } else if (sub === 'end') {
            const gId = options.getString('id');
            const embed = endGiveaway(gId);
            if (embed) await interaction.reply({ embeds: [embed] });
            else await interaction.reply('No such giveaway or no participants.');
        }
    }

    // Dork game
    if (commandName === 'dork') {
        const choice = options.getString('choice');
        const prize = options.getString('prize');
        const res = endDork(user.id, choice, prize);
        if (res) {
            await interaction.reply(res.message);
            if (res.newGame) {
                // Automatically start a new round if double
                await interaction.followUp(`A new round has started with prize ${parseRewardInput(prize) * 2}`);
            }
        }
    }

    // Smoker game
    if (commandName === 'smoker') {
        const bet = options.getString('bet');
        const result = playSmoker(user.id, bet);
        await interaction.reply({ embeds: [result.embed] });
    }

    // Spawner
    if (commandName === 'spawner') {
        const count = options.getString('count');
        const price = options.getString('price');
        const result = calculateSpawnerPrice(count, price);
        await interaction.reply({ embeds: [result.embed] });
    }

    // Moderation
    if (commandName === 'warn') {
        const target = options.getUser('user');
        const reason = options.getString('reason');
        const msg = await warnMember(member.guild.members.cache.get(target.id), reason);
        await interaction.reply(msg);
    }

    if (commandName === 'ban') {
        const target = options.getUser('user');
        const reason = options.getString('reason');
        const days = options.getInteger('days') || 0;
        const msg = await banMember(member.guild.members.cache.get(target.id), reason, days);
        await interaction.reply(msg);
    }

    if (commandName === 'unban') {
        const targetId = options.getString('user_id');
        const msg = await unbanMember(guild, targetId);
        await interaction.reply(msg);
    }

    if (commandName === 'timeout') {
        const target = options.getUser('user');
        const duration = parseRewardInput(options.getString('duration'));
        const reason = options.getString('reason');
        const msg = await timeoutMember(member.guild.members.cache.get(target.id), duration, reason);
        await interaction.reply(msg);
    }

    if (commandName === 'untimeout') {
        const target = options.getUser('user');
        const reason = options.getString('reason');
        const msg = await removeTimeout(member.guild.members.cache.get(target.id), reason);
        await interaction.reply(msg);
    }

    // Role management
    if (commandName === 'addrole') {
        const target = options.getUser('user');
        const role = options.getRole('role');
        const success = await addRole(member.guild.members.cache.get(target.id), role);
        await interaction.reply(success ? 'Role added.' : 'Failed to add role.');
    }

    if (commandName === 'removerole') {
        const target = options.getUser('user');
        const role = options.getRole('role');
        const success = await removeRole(member.guild.members.cache.get(target.id), role);
        await interaction.reply(success ? 'Role removed.' : 'Failed to remove role.');
    }
});
