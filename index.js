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
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    Events
} = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

let warnings = {};
let giveaways = new Map();

/* ---------------- UTILITIES ---------------- */

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
    const value = parseInt(str);
    if (str.endsWith('m')) return value * 60_000;
    if (str.endsWith('h')) return value * 60 * 60_000;
    if (str.endsWith('d')) return value * 24 * 60 * 60_000;
    return null;
}

/* ---------------- COMMANDS ---------------- */

const commands = [

/* SPAWNER */

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

/* SMOKER */

new SlashCommandBuilder()
.setName('smokerprice')
.setDescription('Calculate smoker farm price')
.addIntegerOption(o => o.setName('amount').setDescription('Number of smokers').setRequired(true))
.addStringOption(o => o.setName('kelp').setDescription('Optional kelp farm price')),

/* GIVEAWAY */

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

/* DOUBLE OR KEEP */

new SlashCommandBuilder()
.setName('gcreatedork')
.setDescription('Create double or keep giveaway'),

/* MODERATION */

new SlashCommandBuilder()
.setName('roleadd')
.setDescription('Add role to user')
.addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
.addRoleOption(o => o.setName('role').setDescription('Role').setRequired(true))
.setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

new SlashCommandBuilder()
.setName('unban')
.setDescription('Unban user')
.addStringOption(o => o.setName('userid').setDescription('User ID').setRequired(true))
.setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

new SlashCommandBuilder()
.setName('unmute')
.setDescription('Remove timeout')
.addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
.setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

new SlashCommandBuilder()
.setName('warn')
.setDescription('Warn user')
.addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
.setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

new SlashCommandBuilder()
.setName('lock')
.setDescription('Lock channel')
.setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

/* EMBED */

new SlashCommandBuilder()
.setName('embed')
.setDescription('Create custom embed')
.addSubcommand(sub =>
    sub.setName('create')
    .setDescription('Create embed')
)

].map(c => c.toJSON());

/* REGISTER */

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
    await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
        { body: commands }
    );
})();

/* ---------------- BOT LOGIC ---------------- */

client.on(Events.InteractionCreate, async interaction => {

if (!interaction.isChatInputCommand() && !interaction.isButton() && !interaction.isModalSubmit()) return;

/* SPAWNER CALCULATE */

if (interaction.commandName === 'spawner') {

if (interaction.options.getSubcommand() === 'calculate') {

const amount = interaction.options.getInteger('amount');
const type = interaction.options.getString('type');

const buy = parseMoney(process.env.SPAWNER_BUY_PRICE);
const sell = parseMoney(process.env.SPAWNER_SELL_PRICE);

const pricePer = type === 'buy' ? buy : sell;
const total = amount * pricePer;

let stack = amount >= 64 ? formatMoney(64 * pricePer) : "Not Available";
let half = amount >= 32 ? formatMoney(32 * pricePer) : "Not Available";

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

if (interaction.options.getSubcommand() === 'pricechange') {
if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator))
return interaction.reply({ content: 'Admin only.', ephemeral: true });

process.env.SPAWNER_BUY_PRICE = interaction.options.getString('buy');
process.env.SPAWNER_SELL_PRICE = interaction.options.getString('sell');

return interaction.reply('Prices updated.');
}

if (interaction.options.getSubcommand() === 'embed') {

const embed = new EmbedBuilder()
.setTitle('Spawner Prices')
.addFields(
{ name: 'Buy', value: formatMoney(parseMoney(process.env.SPAWNER_BUY_PRICE)) },
{ name: 'Sell', value: formatMoney(parseMoney(process.env.SPAWNER_SELL_PRICE)) }
)
.setFooter({ text: 'We never go first. Owner trades must be all at once.' });

return interaction.reply({ embeds: [embed] });
}
}

/* SMOKER */

if (interaction.commandName === 'smokerprice') {
const amount = interaction.options.getInteger('amount');
const kelp = interaction.options.getString('kelp');

let total = amount * 200000;
if (kelp) total += parseMoney(kelp);

return interaction.reply(`Total price: ${formatMoney(total)}`);
}

});

client.login(process.env.TOKEN);

/* ---------------- GIVEAWAY & DOUBLE OR KEEP ---------------- */

const { Collection } = require('discord.js');
client.giveaways = new Collection(); // store active giveaways
client.dorkGames = new Collection(); // store active Double or Keep

/* HELPER FUNCTIONS */

function formatWinners(winners) {
    if (winners.length === 1) return winners[0];
    if (winners.length === 2) return winners.join(' and ');
    const last = winners.pop();
    return winners.join(', ') + ', and ' + last;
}

/* ---------------- INTERACTIONS ---------------- */

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand() && !interaction.isButton()) return;

    /* ---- GIVEAWAY ---- */
    if (interaction.commandName === 'giveaway') {
        const timeInput = interaction.options.getString('time');
        const prize = interaction.options.getString('prize');
        const winnersCount = interaction.options.getInteger('winners');
        const description = interaction.options.getString('description');

        const duration = parseTime(timeInput);
        if (!duration) return interaction.reply({ content: 'Invalid time format', ephemeral: true });

        const giveawayId = `${interaction.id}-${Date.now()}`;
        const participants = [];

        const joinButton = new ButtonBuilder()
            .setCustomId(`giveaway_join_${giveawayId}`)
            .setLabel('Join')
            .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder().addComponents(joinButton);

        const msg = await interaction.reply({
            content: `🎉 Giveaway: **${prize}**\n${description}\nWinners: ${winnersCount}\nTime: ${timeInput}\nParticipants: 0`,
            components: [row],
            fetchReply: true
        });

        client.giveaways.set(giveawayId, { message: msg, prize, winnersCount, participants });

        setTimeout(async () => {
            const giveaway = client.giveaways.get(giveawayId);
            if (!giveaway) return;

            const participants = giveaway.participants;
            if (participants.length === 0) {
                await giveaway.message.edit({ content: `Giveaway for **${prize}** ended. No participants.` });
                client.giveaways.delete(giveawayId);
                return;
            }

            const winners = [];
            for (let i = 0; i < Math.min(giveaway.winnersCount, participants.length); i++) {
                const winner = participants.splice(Math.floor(Math.random() * participants.length), 1)[0];
                winners.push(winner);
            }

            await giveaway.message.edit({ content: `🎉 Giveaway ended! Winners: ${formatWinners(winners)} | Prize: ${prize}` });
            client.giveaways.delete(giveawayId);
        }, duration);
    }

    /* ---- DOUBLE OR KEEP ---- */
    if (interaction.commandName === 'gcreatedork') {
        const gameId = `${interaction.id}-${Date.now()}`;
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`dork_double_${gameId}`).setLabel('Double').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`dork_keep_${gameId}`).setLabel('Keep').setStyle(ButtonStyle.Danger)
        );

        const msg = await interaction.reply({
            content: 'Double or Keep game! Winner chooses:',
            components: [row],
            fetchReply: true
        });

        client.dorkGames.set(gameId, { message: msg, players: [] });
    }
});

/* ---------------- BUTTON HANDLER ---------------- */

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton()) return;

    // Giveaway join
    if (interaction.customId.startsWith('giveaway_join_')) {
        const id = interaction.customId.replace('giveaway_join_', '');
        const giveaway = client.giveaways.get(id);
        if (!giveaway) return interaction.reply({ content: 'Giveaway ended or invalid.', ephemeral: true });

        if (!giveaway.participants.includes(interaction.user.username)) {
            giveaway.participants.push(interaction.user.username);
        }

        await giveaway.message.edit({
            content: `${giveaway.message.content.split('\n').slice(0, 3).join('\n')}\nParticipants: ${giveaway.participants.length}`
        });

        return interaction.reply({ content: 'You joined the giveaway!', ephemeral: true });
    }

    // Double or Keep buttons
    if (interaction.customId.startsWith('dork_double_') || interaction.customId.startsWith('dork_keep_')) {
        const gameId = interaction.customId.split('_').slice(2).join('_');
        const game = client.dorkGames.get(gameId);
        if (!game) return interaction.reply({ content: 'Game expired.', ephemeral: true });

        game.players.push({ user: interaction.user.username, choice: interaction.customId.includes('double') ? 'Double' : 'Keep' });

        await interaction.reply({ content: `You chose ${interaction.customId.includes('double') ? 'Double' : 'Keep'}`, ephemeral: true });
    }
});

const { Collection, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, Events } = require('discord.js');

client.giveaways = new Collection(); // Active giveaways
client.dorkGames = new Collection(); // Active Double/Keep games

/* ---------- HELPERS ---------- */
function formatMoney(value) {
    if (value >= 1e6) return `${value / 1e6}M`;
    return value.toString();
}

function formatWinners(winners) {
    if (winners.length === 1) return `<@${winners[0]}>`;
    if (winners.length === 2) return winners.map(id => `<@${id}>`).join(' and ');
    const last = winners.pop();
    return winners.map(id => `<@${id}>`).join(', ') + ', and ' + `<@${last}>`;
}

function parseTime(str) {
    const match = str.match(/(\d+)([smhd])/);
    if (!match) return null;
    const n = parseInt(match[1]);
    const unit = match[2];
    if (unit === 's') return n * 1000;
    if (unit === 'm') return n * 60 * 1000;
    if (unit === 'h') return n * 60 * 60 * 1000;
    if (unit === 'd') return n * 24 * 60 * 60 * 1000;
    return null;
}

/* ---------- GIVEAWAY COMMAND ---------- */
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    /* ---- Create Giveaway ---- */
    if (interaction.commandName === 'giveaway') {
        const prize = interaction.options.getString('prize');
        const description = interaction.options.getString('description');
        const winnersCount = interaction.options.getInteger('winners');
        const durationInput = interaction.options.getString('time');
        const duration = parseTime(durationInput);
        if (!duration) return interaction.reply({ content: 'Invalid time format', ephemeral: true });

        const endTimestamp = Date.now() + duration;
        const giveawayId = `${interaction.id}-${Date.now()}`;
        const participants = [];

        const joinButton = new ButtonBuilder()
            .setCustomId(`giveaway_join_${giveawayId}`)
            .setLabel('Join')
            .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder().addComponents(joinButton);

        const embed = new EmbedBuilder()
            .setTitle(`🎉 **${prize}**`)
            .setDescription(`${description}\n\nEnding: <t:${Math.floor(endTimestamp / 1000)}:R>\nHosted by: <@${interaction.user.id}>\nEntries: 0`)
            .setColor('#FFD700');

        const msg = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });

        client.giveaways.set(giveawayId, {
            message: msg,
            prize,
            description,
            hostId: interaction.user.id,
            participants,
            endTimestamp,
            winnersCount
        });

        /* Auto end giveaway */
        setTimeout(async () => {
            const giveaway = client.giveaways.get(giveawayId);
            if (!giveaway) return;

            const participantsCopy = [...giveaway.participants];
            if (participantsCopy.length === 0) {
                await giveaway.message.edit({ embeds: [embed.setDescription(`${description}\n\nEnded: <t:${Math.floor(Date.now() / 1000)}:R>\nHosted by: <@${interaction.user.id}>\nEntries: 0`)], components: [] });
                client.giveaways.delete(giveawayId);
                return;
            }

            const winners = [];
            for (let i = 0; i < Math.min(giveaway.winnersCount, participantsCopy.length); i++) {
                const winnerIndex = Math.floor(Math.random() * participantsCopy.length);
                winners.push(participantsCopy.splice(winnerIndex, 1)[0]);
            }

            await giveaway.message.edit({
                embeds: [embed.setDescription(`${description}\n\nEnded: <t:${Math.floor(Date.now() / 1000)}:R>\nHosted by: <@${giveaway.hostId}>\nEntries: ${giveaway.participants.length}\nWinner(s): ${formatWinners(winners)}`)],
                components: []
            });

            client.giveaways.delete(giveawayId);
        }, duration);
    }

    /* ---- Double or Keep ---- */
    if (interaction.commandName === 'gcreatedork') {
        const startAmountInput = interaction.options.getString('startamount'); // in millions
        const maxAmountInput = interaction.options.getString('maxamount'); // in millions
        const durationInput = interaction.options.getString('time'); // e.g., 5m, 1h

        const startAmount = parseInt(startAmountInput);
        const maxAmount = parseInt(maxAmountInput);
        const duration = parseTime(durationInput);
        if (!startAmount || !maxAmount || !duration) return interaction.reply({ content: 'Invalid input', ephemeral: true });

        const endTimestamp = Date.now() + duration;
        const gameId = `${interaction.id}-${Date.now()}`;

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`dork_double_${gameId}`).setLabel('Double').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`dork_keep_${gameId}`).setLabel('Keep').setStyle(ButtonStyle.Danger)
        );

        const embed = new EmbedBuilder()
            .setTitle(`💰 Double or Keep — $${formatMoney(startAmount * 1e6)}`)
            .setDescription(`Maximum: $${formatMoney(maxAmount * 1e6)}\nHosted by: <@${interaction.user.id}>\nEnding: <t:${Math.floor(endTimestamp / 1000)}:R>`)
            .setColor('#00FF00');

        const msg = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });

        client.dorkGames.set(gameId, { message: msg, amount: startAmount, maxAmount, hostId: interaction.user.id, endTimestamp, winner: null });
    }
});

/* ---------- BUTTON HANDLER ---------- */
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton()) return;

    /* Giveaway Join */
    if (interaction.customId.startsWith('giveaway_join_')) {
        const id = interaction.customId.replace('giveaway_join_', '');
        const giveaway = client.giveaways.get(id);
        if (!giveaway) return interaction.reply({ content: 'Giveaway ended or invalid.', ephemeral: true });

        if (!giveaway.participants.includes(interaction.user.id)) giveaway.participants.push(interaction.user.id);

        const embed = new EmbedBuilder()
            .setTitle(`🎉 **${giveaway.prize}**`)
            .setDescription(`${giveaway.description}\n\nEnding: <t:${Math.floor(giveaway.endTimestamp / 1000)}:R>\nHosted by: <@${giveaway.hostId}>\nEntries: ${giveaway.participants.length}`)
            .setColor('#FFD700');

        await giveaway.message.edit({ embeds: [embed] });
        return interaction.reply({ content: 'You joined the giveaway!', ephemeral: true });
    }

    /* Double or Keep Buttons */
    if (interaction.customId.startsWith('dork_double_') || interaction.customId.startsWith('dork_keep_')) {
        const gameId = interaction.customId.split('_').slice(2).join('_');
        const game = client.dorkGames.get(gameId);
        if (!game) return interaction.reply({ content: 'Game expired.', ephemeral: true });

        if (game.winner && game.winner !== interaction.user.id)
            return interaction.reply({ content: 'Only the winner can choose!', ephemeral: true });

        game.winner = interaction.user.id;

        if (interaction.customId.includes('double')) {
            const newAmount = game.amount * 2;
            const newEmbed = new EmbedBuilder()
                .setTitle(`💰 Double or Keep — $${formatMoney(newAmount * 1e6)}`)
                .setDescription(`Maximum: $${formatMoney(game.maxAmount * 1e6)}\nHosted by: <@${game.hostId}>\nEnding: <t:${Math.floor(Date.now() / 1000 + 600)}:R>`)
                .setColor('#00FF00');

            await interaction.update({ embeds: [newEmbed], components: interaction.message.components });
            game.amount = newAmount; // update amount for next round
        } else {
            await interaction.update({ content: `Game ended! Winner: <@${game.winner}> chose Keep.`, embeds: [], components: [] });
            client.dorkGames.delete(gameId);
        }
    }
});

/* ---------- /gend COMMAND ---------- */
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== 'gend') return;

    const inputId = interaction.options.getString('messageid'); // optional
    let giveaway;

    if (inputId) {
        giveaway = [...client.giveaways.values()].find(g => g.message.id === inputId);
        if (!giveaway) return interaction.reply({ content: 'Giveaway not found with that ID.', ephemeral: true });
    } else {
        giveaway = [...client.giveaways.values()].pop(); // most recent
        if (!giveaway) return interaction.reply({ content: 'No active giveaways.', ephemeral: true });
    }

    const winners = [];
    const participantsCopy = [...giveaway.participants];
    for (let i = 0; i < Math.min(giveaway.winnersCount, participantsCopy.length); i++) {
        const winner = participantsCopy.splice(Math.floor(Math.random() * participantsCopy.length), 1)[0];
        winners.push(winner);
    }

    const embed = new EmbedBuilder()
        .setTitle(`🎉 **${giveaway.prize}**`)
        .setDescription(`${giveaway.description}\n\nEnded: <t:${Math.floor(Date.now() / 1000)}:R>\nHosted by: <@${giveaway.hostId}>\nEntries: ${giveaway.participants.length}\nWinner(s): ${formatWinners(winners)}`)
        .setColor('#FFD700');

    await giveaway.message.edit({ embeds: [embed], components: [] });
    client.giveaways.delete([...client.giveaways.keys()].find(k => client.giveaways.get(k) === giveaway));

    interaction.reply({ content: `Giveaway ended manually. Winner(s): ${formatWinners(winners)}` });
});
