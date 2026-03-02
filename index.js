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
