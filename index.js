// ─── IMPORTS ───
const {
    Client,
    GatewayIntentBits,
    SlashCommandBuilder,
    REST,
    Routes,
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    Events,
    Collection
} = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// ─── DATA ───
let warnings = {}; // userID -> count
const giveaways = new Collection();
const doubleOrKeep = new Collection();

// Default spawner prices
let SPAWNER_BUY_PRICE = parseInt(process.env.SPAWNER_BUY_PRICE) || 1000000;
let SPAWNER_SELL_PRICE = parseInt(process.env.SPAWNER_SELL_PRICE) || 800000;

// ─── UTILITY FUNCTIONS ───
function parseMoney(input) {
    if (!input) return 0;
    if (typeof input === 'number') return input;
    input = input.toString().toUpperCase();
    if (input.endsWith('M')) return parseFloat(input) * 1_000_000;
    if (input.endsWith('B')) return parseFloat(input) * 1_000_000_000;
    if (input.endsWith('K')) return parseFloat(input) * 1_000;
    return parseInt(input) || 0;
}

function formatMoney(num) {
    if (num >= 1_000_000_000) return (num / 1_000_000_000) + "B";
    if (num >= 1_000_000) return (num / 1_000_000) + "M";
    if (num >= 1_000) return (num / 1_000) + "K";
    return num.toString();
}

function parseTime(str) {
    if (!str) return null;
    const value = parseInt(str);
    if (str.endsWith('m')) return value * 60_000;
    if (str.endsWith('h')) return value * 60 * 60_000;
    if (str.endsWith('d')) return value * 24 * 60 * 60_000;
    return null;
}

function formatWinners(winners) {
    if (winners.length === 0) return 'No winners';
    if (winners.length === 1) return `<@${winners[0]}>`;
    if (winners.length === 2) return `<@${winners[0]}> and <@${winners[1]}>`;
    const last = winners.pop();
    return winners.map(u => `<@${u}>`).join(', ') + ', and ' + `<@${last}>`;
}

// ─── COMMAND DEFINITIONS ───
const commands = [

    // SPAWNER
    new SlashCommandBuilder()
        .setName('spawner')
        .setDescription('Spawner system')
        .addSubcommand(sub =>
            sub.setName('calculate')
            .setDescription('Calculate spawner price')
            .addIntegerOption(o => o.setName('amount').setDescription('Number of spawners').setRequired(true))
            .addStringOption(o =>
                o.setName('type')
                .setDescription('Buy or Sell')
                .setRequired(true)
                .addChoices(
                    { name: 'buy', value: 'buy' },
                    { name: 'sell', value: 'sell' }
                )
            )
        )
        .addSubcommand(sub =>
            sub.setName('pricechange')
            .setDescription('Change default prices')
            .addStringOption(o => o.setName('buy').setDescription('New buy price').setRequired(true))
            .addStringOption(o => o.setName('sell').setDescription('New sell price').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('embed')
            .setDescription('Send spawner embed')
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    // SMOKER
    new SlashCommandBuilder()
        .setName('smokerprice')
        .setDescription('Calculate smoker farm price')
        .addIntegerOption(o => o.setName('amount').setDescription('Number of smokers').setRequired(true))
        .addStringOption(o => o.setName('kelp').setDescription('Optional kelp farm price')),

    // GIVEAWAY
    new SlashCommandBuilder()
        .setName('giveaway')
        .setDescription('Create giveaway')
        .addStringOption(o => o.setName('time').setDescription('Example: 5m, 5h, 30d').setRequired(true))
        .addStringOption(o => o.setName('prize').setDescription('Prize').setRequired(true))
        .addIntegerOption(o => o.setName('winners').setDescription('Number of winners').setRequired(true))
        .addStringOption(o => o.setName('description').setDescription('Description').setRequired(true)),

    new SlashCommandBuilder()
        .setName('gend')
        .setDescription('End giveaway manually')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    new SlashCommandBuilder()
        .setName('gcreatedork')
        .setDescription('Create double or keep giveaway')
        .addIntegerOption(o => o.setName('amount').setDescription('Amount (numbers only)').setRequired(true)),

    // MODERATION
    new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Warn user')
        .addUserOption(o => o.setName('user').setDescription('User to warn').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    new SlashCommandBuilder()
        .setName('unmute')
        .setDescription('Remove timeout')
        .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    new SlashCommandBuilder()
        .setName('unban')
        .setDescription('Unban user')
        .addStringOption(o => o.setName('userid').setDescription('User ID').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

    new SlashCommandBuilder()
        .setName('roleadd')
        .setDescription('Add role to user')
        .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
        .addRoleOption(o => o.setName('role').setDescription('Role').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    new SlashCommandBuilder()
        .setName('roleremove')
        .setDescription('Remove role from user')
        .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
        .addRoleOption(o => o.setName('role').setDescription('Role').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    new SlashCommandBuilder()
        .setName('lock')
        .setDescription('Lock a channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    new SlashCommandBuilder()
        .setName('embed')
        .setDescription('Create custom embed')
        .addSubcommand(sub => sub.setName('create').setDescription('Create embed'))
].map(c => c.toJSON());

// ─── REGISTER COMMANDS ───
const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
(async () => {
    try {
        console.log('Registering commands...');
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands }
        );
        console.log('Commands registered.');
    } catch (err) { console.error(err); }
})();

// ─── INTERACTION HANDLER ───
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand() && !interaction.isButton()) return;

    const cmd = interaction.commandName;

    // ─── SPAWNER ───
    if (cmd === 'spawner') {
        const sub = interaction.options.getSubcommand();
        if (sub === 'calculate') {
            const amount = interaction.options.getInteger('amount');
            const type = interaction.options.getString('type');
            const pricePer = type === 'buy' ? SPAWNER_BUY_PRICE : SPAWNER_SELL_PRICE;
            const total = amount * pricePer;
            const stack = amount >= 64 ? formatMoney(64 * pricePer) : 'Not Available';
            const half = amount >= 32 ? formatMoney(32 * pricePer) : 'Not Available';

            const embed = new EmbedBuilder()
                .setTitle('Spawner Calculation')
                .setDescription(`Amount: ${amount}\nType: ${type}\nPrice per spawner: ${formatMoney(pricePer)}`)
                .addFields(
                    { name: 'Total', value: formatMoney(total), inline: true },
                    { name: '64 Stack', value: stack, inline: true },
                    { name: '32 Half', value: half, inline: true }
                );
            return interaction.reply({ embeds: [embed] });
        }

        if (sub === 'pricechange') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator))
                return interaction.reply({ content: 'Admin only.', ephemeral: true });
            SPAWNER_BUY_PRICE = parseMoney(interaction.options.getString('buy'));
            SPAWNER_SELL_PRICE = parseMoney(interaction.options.getString('sell'));
            return interaction.reply('Spawner prices updated.');
        }

        if (sub === 'embed') {
            const embed = new EmbedBuilder()
                .setTitle('Spawner Prices')
                .addFields(
                    { name: 'Buy', value: formatMoney(SPAWNER_BUY_PRICE), inline: true },
                    { name: 'Sell', value: formatMoney(SPAWNER_SELL_PRICE), inline: true }
                );
            return interaction.reply({ embeds: [embed] });
        }
    }

    // ─── SMOKER ───
    if (cmd === 'smokerprice') {
        const amount = interaction.options.getInteger('amount');
        const kelp = parseMoney(interaction.options.getString('kelp'));
        const total = amount * 200_000 + kelp;
        return interaction.reply(`Total smoker farm price: ${formatMoney(total)}`);
    }

    // ─── MODERATION ───
    if (cmd === 'warn') {
        const user = interaction.options.getUser('user');
        warnings[user.id] = (warnings[user.id] || 0) + 1;
        return interaction.reply(`${user} has been warned. Total warnings: ${warnings[user.id]}`);
    }

    if (cmd === 'unmute') {
        const user = interaction.options.getUser('user');
        const member = await interaction.guild.members.fetch(user.id).catch(()=>null);
        if (!member) return interaction.reply({ content: 'User not found.', ephemeral:true });
        await member.timeout(null);
        return interaction.reply({ content: `${user} has been unmuted.` });
    }

    if (cmd === 'unban') {
        const userId = interaction.options.getString('userid');
        await interaction.guild.bans.remove(userId).catch(()=>null);
        return interaction.reply({ content: `<@${userId}> unbanned.` });
    }

    if (cmd === 'roleadd') {
        const user = interaction.options.getUser('user');
        const role = interaction.options.getRole('role');
        const member = await interaction.guild.members.fetch(user.id).catch(()=>null);
        if (!member) return interaction.reply({ content: 'User not found.', ephemeral:true });
        await member.roles.add(role);
        return interaction.reply({ content: `${role} added to ${user}.` });
    }

    if (cmd === 'roleremove') {
        const user = interaction.options.getUser('user');
        const role = interaction.options.getRole('role');
        const member = await interaction.guild.members.fetch(user.id).catch(()=>null);
        if (!member) return interaction.reply({ content: 'User not found.', ephemeral:true });
        await member.roles.remove(role);
        return interaction.reply({ content: `${role} removed from ${user}.` });
    }

    if (cmd === 'lock') {
        const channel = interaction.channel;
        await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false });
        return interaction.reply({ content: 'Channel locked.' });
    }

    // ─── GIVEAWAYS ───
    if (cmd === 'giveaway') {
        const timeStr = interaction.options.getString('time');
        const prize = interaction.options.getString('prize');
        const winnersCount = interaction.options.getInteger('winners');
        const desc = interaction.options.getString('description');
        const duration = parseTime(timeStr);
        if (!duration) return interaction.reply({ content:'Invalid time format.', ephemeral:true });

        const embed = new EmbedBuilder()
            .setTitle(`🎉 Giveaway: ${prize}`)
            .setDescription(`${desc}\nHosted by: ${interaction.user}\nEnding: <t:${Math.floor((Date.now()+duration)/1000)}:R>`)
            .setColor('Random');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('joinGiveaway').setLabel('Join').setStyle(ButtonStyle.Primary)
        );

        const msg = await interaction.reply({ embeds: [embed], components: [row], fetchReply:true });

        giveaways.set(msg.id, {
            prize,
            host: interaction.user.id,
            winnersCount,
            participants: new Set(),
            end: Date.now()+duration,
            channelId: interaction.channel.id
        });

        setTimeout(()=> endGiveaway(msg.id), duration);
    }

    if (cmd === 'gend') {
        const msgId = interaction.options.getString('messageid') || Array.from(giveaways.keys()).pop();
        if (!msgId) return interaction.reply({ content:'No active giveaway.', ephemeral:true });
        await endGiveaway(msgId, true);
        return interaction.reply({ content:'Giveaway ended manually.', ephemeral:true });
    }

    // ─── DOUBLE OR KEEP ───
    if (cmd === 'gcreatedork') {
        const amount = interaction.options.getInteger('amount');
        const embed = new EmbedBuilder()
            .setTitle(`💰 Double or Keep: ${formatMoney(amount)}`)
            .setDescription(`Hosted by: ${interaction.user}`)
            .setColor('Random');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`dork_${amount}_${interaction.user.id}`).setLabel('Double or Keep').setStyle(ButtonStyle.Primary)
        );

        const msg = await interaction.reply({ embeds:[embed], components:[row], fetchReply:true });

        doubleOrKeep.set(msg.id, {
            amount,
            host: interaction.user.id,
            channelId: interaction.channel.id
        });
    }
});

// ─── BUTTON HANDLER ───
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton()) return;

    // ─── GIVEAWAY JOIN ───
    if (interaction.customId === 'joinGiveaway') {
        const giveaway = giveaways.get(interaction.message.id);
        if (!giveaway) return interaction.reply({ content:'Giveaway ended.', ephemeral:true });
        giveaway.participants.add(interaction.user.id);
        await interaction.reply({ content:'You joined the giveaway!', ephemeral:true });
    }

    // ─── DOUBLE OR KEEP LOGIC ───
    if (interaction.customId.startsWith('dork_')) {
        const parts = interaction.customId.split('_');
        let [ , amt, hostId ] = parts;
        amt = parseInt(amt);
        const game = doubleOrKeep.get(interaction.message.id);
        if (!game) return interaction.reply({ content:'Game expired.', ephemeral:true });

        const userId = interaction.user.id;
        const newAmount = amt * 2;

        // Ask user choice via button confirmation
        const choice = interaction.customId.includes('double') ? 'Double' : 'Keep';

        if (choice === 'Double') {
            // Start a new Double-or-Keep game with double amount
            const embed = new EmbedBuilder()
                .setTitle(`💰 Double or Keep: ${formatMoney(newAmount)}`)
                .setDescription(`Hosted by: ${interaction.user}`)
                .setColor('Random');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`dork_${newAmount}_${userId}`).setLabel('Double or Keep').setStyle(ButtonStyle.Primary)
            );

            const msg = await interaction.reply({ embeds:[embed], components:[row], fetchReply:true });
            doubleOrKeep.set(msg.id, { amount:newAmount, host:userId, channelId:interaction.channel.id });
            doubleOrKeep.delete(interaction.message.id); // remove old
        } else {
            // Keep: announce winner
            await interaction.reply({ content:`<@${userId}> chose Keep and won ${formatMoney(amt)}!`, fetchReply:true });
            doubleOrKeep.delete(interaction.message.id);
        }
    }
});

// ─── GIVEAWAY END FUNCTION ───
async function endGiveaway(msgId, manual=false) {
    const g = giveaways.get(msgId);
    if (!g) return;
    const channel = await client.channels.fetch(g.channelId).catch(()=>null);
    if (!channel) return giveaways.delete(msgId);

    const participants = Array.from(g.participants);
    let winners = [];
    if (participants.length <= g.winnersCount) winners = participants;
    else {
        while (winners.length < g.winnersCount) {
            const pick = participants[Math.floor(Math.random() * participants.length)];
            if (!winners.includes(pick)) winners.push(pick);
        }
    }

    const embed = new EmbedBuilder()
        .setTitle(`🎉 Giveaway Ended: ${g.prize}`)
        .setDescription(`Winners: ${formatWinners(winners)}\nHosted by: <@${g.host}>`)
        .setColor('Random');

        const msg = await channel.send({ embeds: [embed] }).catch(() => null);
    giveaways.delete(msgId);
}

// ─── CLIENT READY ───
client.once(Events.ClientReady, () => {
    console.log(`Logged in as ${client.user.tag}`);
});

// ─── LOGIN ───
client.login(process.env.TOKEN);

// ─── CLIENT SETUP ───
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// ─── DATA STORAGE ───
let warnings = {}; // userID -> warning count
const giveaways = new Collection(); // active giveaways
const doubleOrKeepGames = new Collection(); // active double-or-keep games

// ─── UTILITIES ───
function parseMoney(input) {
    if (typeof input === 'number') return input;
    input = input.toString().toUpperCase();
    if (input.endsWith('M')) return parseFloat(input) * 1_000_000;
    if (input.endsWith('B')) return parseFloat(input) * 1_000_000_000;
    if (input.endsWith('K')) return parseFloat(input) * 1_000;
    return parseInt(input);
}

function formatMoney(num) {
    if (num >= 1_000_000_000) return (num / 1_000_000_000) + "B";
    if (num >= 1_000_000) return (num / 1_000_000) + "M";
    if (num >= 1_000) return (num / 1_000) + "K";
    return num.toString();
}

function parseTime(str) {
    if (!str) return null;
    const value = parseInt(str);
    if (str.endsWith('m')) return value * 60_000;
    if (str.endsWith('h')) return value * 60 * 60_000;
    if (str.endsWith('d')) return value * 24 * 60 * 60_000;
    return null;
}

function formatWinners(winners) {
    if (winners.length === 1) return winners[0];
    if (winners.length === 2) return winners.join(' and ');
    const last = winners.pop();
    return winners.join(', ') + ', and ' + last;
}

// ─── COMMAND DEFINITIONS ───
const commands = [

    // SPAWNER
    new SlashCommandBuilder()
        .setName('spawner')
        .setDescription('Spawner system')
        .addSubcommand(sub =>
            sub.setName('calculate')
            .setDescription('Calculate spawner price')
            .addIntegerOption(o => o.setName('amount').setDescription('Number of spawners').setRequired(true))
            .addStringOption(o =>
                o.setName('type')
                .setDescription('Buy or Sell')
                .setRequired(true)
                .addChoices(
                    { name: 'buy', value: 'buy' },
                    { name: 'sell', value: 'sell' }
                )
            )
        )
        .addSubcommand(sub =>
            sub.setName('pricechange')
            .setDescription('Change default prices')
            .addStringOption(o => o.setName('buy').setDescription('New buy price').setRequired(true))
            .addStringOption(o => o.setName('sell').setDescription('New sell price').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('embed')
            .setDescription('Show current spawner prices')
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    // SMOKER
    new SlashCommandBuilder()
        .setName('smokerprice')
        .setDescription('Calculate smoker farm price')
        .addIntegerOption(o => o.setName('amount').setDescription('Number of smokers').setRequired(true))
        .addStringOption(o => o.setName('kelp').setDescription('Optional kelp farm price')),

    // GIVEAWAY
    new SlashCommandBuilder()
        .setName('giveaway')
        .setDescription('Create a giveaway')
        .addStringOption(o => o.setName('time').setDescription('Example: 5m, 5h, 30d').setRequired(true))
        .addStringOption(o => o.setName('prize').setDescription('Prize').setRequired(true))
        .addIntegerOption(o => o.setName('winners').setDescription('Number of winners').setRequired(true))
        .addStringOption(o => o.setName('description').setDescription('Description').setRequired(true)),

    new SlashCommandBuilder()
        .setName('gend')
        .setDescription('End giveaway manually')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    new SlashCommandBuilder()
        .setName('gcreatedork')
        .setDescription('Create Double-or-Keep game'),

    // MODERATION
    new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Warn user')
        .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    new SlashCommandBuilder()
        .setName('unmute')
        .setDescription('Remove timeout')
        .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    new SlashCommandBuilder()
        .setName('unban')
        .setDescription('Unban user')
        .addStringOption(o => o.setName('userid').setDescription('User ID').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

    new SlashCommandBuilder()
        .setName('lock')
        .setDescription('Lock channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    new SlashCommandBuilder()
        .setName('roleadd')
        .setDescription('Add role to user')
        .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
        .addRoleOption(o => o.setName('role').setDescription('Role').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    new SlashCommandBuilder()
        .setName('roleremove')
        .setDescription('Remove role from user')
        .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
        .addRoleOption(o => o.setName('role').setDescription('Role').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    // EMBED
    new SlashCommandBuilder()
        .setName('embed')
        .setDescription('Create embed')
        .addSubcommand(sub => sub.setName('create').setDescription('Create embed')),

].map(c => c.toJSON());

// ─── REGISTER COMMANDS ───
const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
    try {
        console.log('Registering commands...');
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands }
        );
        console.log('Commands registered.');
    } catch (err) {
        console.error(err);
    }
})();

// ─── INTERACTIONS HANDLER ───
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand() && !interaction.isButton() && !interaction.isModalSubmit()) return;

    const cmd = interaction.commandName;

    // ─── SPAWNER ───
    if (cmd === 'spawner') {
        const sub = interaction.options.getSubcommand();
        const buyPrice = parseMoney(process.env.SPAWNER_BUY_PRICE || 5000000);
        const sellPrice = parseMoney(process.env.SPAWNER_SELL_PRICE || 5000000);

        if (sub === 'calculate') {
            const amount = interaction.options.getInteger('amount');
            const type = interaction.options.getString('type');
            const pricePer = type === 'buy' ? buyPrice : sellPrice;
            const total = amount * pricePer;
            const stack = amount >= 64 ? formatMoney(64 * pricePer) : "Not Available";
            const half = amount >= 32 ? formatMoney(32 * pricePer) : "Not Available";

            const embed = new EmbedBuilder()
                .setTitle('Spawner Calculation')
                .setDescription(`Amount: ${amount}\nType: ${type}\nPrice per spawner: ${formatMoney(pricePer)}`)
                .addFields(
                    { name: 'Total', value: formatMoney(total) },
                    { name: '64 Stack', value: stack },
                    { name: '32 Half', value: half }
                );

            return interaction.reply({ embeds: [embed] });
        }

        if (sub === 'pricechange') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator))
                return interaction.reply({ content: 'Admin only.', ephemeral: true });

            process.env.SPAWNER_BUY_PRICE = interaction.options.getString('buy');
            process.env.SPAWNER_SELL_PRICE = interaction.options.getString('sell');
            return interaction.reply('Prices updated.');
        }

        if (sub === 'embed') {
            const embed = new EmbedBuilder()
                .setTitle('Spawner Prices')
                .addFields(
                    { name: 'Buy', value: formatMoney(buyPrice) },
                    { name: 'Sell', value: formatMoney(sellPrice) }
                )
                .setFooter({ text: 'We never go first. Owner trades must be all at once.' });
            return interaction.reply({ embeds: [embed] });
        }
    }

    // ─── SMOKER ───
    if (cmd === 'smokerprice') {
        const amount = interaction.options.getInteger('amount');
        const kelp = interaction.options.getString('kelp');
        let total = amount * 200000;
        if (kelp) total += parseMoney(kelp);
        return interaction.reply(`Total price: ${formatMoney(total)}`);
    }

    // ─── MODERATION ───
    if (cmd === 'warn') {
        const user = interaction.options.getUser('user');
        warnings[user.id] = (warnings[user.id] || 0) + 1;
        return interaction.reply(`${user} has been warned. Total warnings: ${warnings[user.id]}`);
    }

    if (cmd === 'unmute') {
        const user = interaction.options.getUser('user');
        return interaction.reply(`${user} timeout removed.`);
    }

    if (cmd === 'unban') {
        const userId = interaction.options.getString('userid');
        return interaction.guild.bans.remove(userId).then(() =>
            interaction.reply(`Unbanned user: ${userId}`)
        ).catch(() => interaction.reply(`Could not unban user ${userId}`));
    }

    if (cmd === 'lock') {
        interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false });
        return interaction.reply('Channel locked.');
    }

    if (cmd === 'roleadd') {
        const user = interaction.options.getUser('user');
        const role = interaction.options.getRole('role');
        user.roles.add(role);
        return interaction.reply(`Added role ${role} to ${user}`);
    }

    if (cmd === 'roleremove') {
        const user = interaction.options.getUser('user');
        const role = interaction.options.getRole('role');
        user.roles.remove(role);
        return interaction.reply(`Removed role ${role} from ${user}`);
    }

    // ─── EMBED ───
    if (cmd === 'embed') {
        return interaction.reply('Embed creation subcommand not implemented yet.');
    }

    // ─── GIVEAWAY CREATION ───
    if (cmd === 'giveaway') {
        const prize = interaction.options.getString('prize');
        const winnersCount = interaction.options.getInteger('winners');
        const durationStr = interaction.options.getString('time');
        const description = interaction.options.getString('description');
        const duration = parseTime(durationStr);

        if (!duration) return interaction.reply({ content: 'Invalid time format.', ephemeral: true });

        const giveawayId = `${interaction.id}-${Date.now()}`;
        const participants = [];

        const joinButton = new ButtonBuilder()
            .setCustomId(`giveaway_join_${giveawayId}`)
            .setLabel('Join')
            .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder().addComponents(joinButton);

        const msg = await interaction.reply({
            content: `🎉 Giveaway: **${prize}**\n${description}\nWinners: ${winnersCount}\nParticipants: 0`,
            components: [row],
            fetchReply: true
        });

        giveaways.set(giveawayId, { message: msg, prize, winnersCount, participants });

        setTimeout(async () => endGiveaway(giveawayId), duration);
    }

    if (cmd === 'gend') {
        const messageId = interaction.options.getString('messageid');
        const idToEnd = messageId || Array.from(giveaways.keys()).pop();
        if (!idToEnd) return interaction.reply({ content: 'No active giveaway found.', ephemeral: true });
        await endGiveaway(idToEnd, true);
        return interaction.reply({ content: 'Giveaway ended manually.', ephemeral: true });
    }

    // ─── DOUBLE OR KEEP CREATION ───
    if (cmd === 'gcreatedork') {
        const gameId = `${interaction.id}-${Date.now()}`;
        const startAmount = 5_000_000; // always 5M starting
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId(`dork_double_${gameId}`).setLabel('Double').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`dork_keep_${gameId}`).setLabel('Keep').setStyle(ButtonStyle.Danger)
            );

        const msg = await interaction.reply({
            content: `Double or Keep game! Starting with 5M`,
            components: [row],
            fetchReply: true
        });

        doubleOrKeepGames.set(gameId, { message: msg, amount: startAmount, host: interaction.user });
    }
});

// ─── BUTTON HANDLER ───
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton()) return;

    // Giveaway join
    if (interaction.customId.startsWith('giveaway_join_')) {
        const id = interaction.customId.replace('giveaway_join_', '');
        const giveaway = giveaways.get(id);
        if (!giveaway) return interaction.reply({ content: 'Giveaway ended.', ephemeral: true });

        if (!giveaway.participants.includes(interaction.user.id))
            giveaway.participants.push(interaction.user.id);

        await giveaway.message.edit({
            content: `${giveaway.message.content.split('\n').slice(0, 3).join('\n')}\nParticipants: ${giveaway.participants.length}`
        });

        return interaction.reply({ content: 'You joined the giveaway!', ephemeral: true });
    }

    // Double or Keep logic
    if (interaction.customId.startsWith('dork_')) {
        const [action, , gameId] = interaction.customId.split('_');
        const game = doubleOrKeepGames.get(gameId);
        if (!game) return interaction.reply({ content: 'Game expired.', ephemeral: true });

        if (action === 'double') {
            game.amount *= 2;
            await interaction.update({ content: `Double chosen! New amount: ${formatMoney(game.amount)}`, components: [] });
        } else {
            await interaction.update({ content: `<@${interaction.user.id}> chose Keep and won ${formatMoney(game.amount)}`, components: [] });
            doubleOrKeepGames.delete(gameId);
        }
    }
});

// ─── END GIVEAWAY FUNCTION ───
async function endGiveaway(id) {
    const giveaway = giveaways.get(id);
    if (!giveaway) return;
    const participants = giveaway.participants;
    if (!participants.length) {
        await giveaway.message.edit({ content: `Giveaway for **${giveaway.prize}** ended. No participants.` });
        giveaways.delete(id);
        return;
    }
    const winners = [];
    for (let i = 0; i < Math.min(giveaway.winnersCount, participants.length); i++) {
        const winnerIndex = Math.floor(Math.random() * participants.length);
        winners.push(`<@${participants.splice(winnerIndex, 1)[0]}>`);
    }
    await giveaway.message.edit({ content: `🎉 Giveaway ended! Winners: ${winners.join(', ')} | Prize: ${giveaway.prize}` });
    giveaways.delete(id);
}

// ─── LOGIN ───
client.login(process.env.TOKEN);

console.log('Bot fully loaded.');


