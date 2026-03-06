// ============================================================
// index.js — Part 1: Imports, Setup, Command Definitions
// ============================================================
const {
Client,
GatewayIntentBits,
Partials,
EmbedBuilder,
ButtonBuilder,
ButtonStyle,
ActionRowBuilder,
ModalBuilder,
TextInputBuilder,
TextInputStyle,
ChannelType,
PermissionFlagsBits,
PermissionsBitField,
MessageFlags,
REST,
Routes,
SlashCommandBuilder,
} = require("discord.js");
// ── Client ──────────────────────────────────────────────────
const client = new Client({
intents: [
GatewayIntentBits.Guilds,
GatewayIntentBits.GuildMembers,
GatewayIntentBits.GuildMessages,
GatewayIntentBits.MessageContent,
GatewayIntentBits.DirectMessages,
GatewayIntentBits.DirectMessageReactions,
],
partials: [Partials.Channel, Partials.Message], // Required for DM handling in discord.js v14
});
// ── In-memory stores ─────────────────────────────────────────
// Spawner prices (admins can update at runtime)
const spawnerConfig = {
buyPrice: 4400000, // server buys FROM players
sellPrice: 5200000, // server sells TO players
};

// Active giveaways { messageId -> giveawayData }
const activeGiveaways = new Map();
// Active dork sessions { messageId -> dorkData }
const activeDorks = new Map();
// Active application sessions { userId -> sessionData }
const activeApplications = new Map();
// Vouch store { userId -> [{ fromId, reason, timestamp }] }
const vouchStore = new Map();
// Giveaway host tracker { "guildId:userId" -> count }
const giveawayHostCounts = new Map();
// Pricing message (set by founder via /pricingset)
let pricingMessage = null;
// ── Ticket category names (must match exactly in your server) ─
const TICKET_CATEGORIES = {
support: "Support Tickets",
giveaway: "Giveaway Tickets",
partnership: "Partnership Ticket",
spawner: "Spawner Staff Ticket",
report: "Member/Staff Report",
building: "Building Ticket",
mysterybox: "Mystery Box",
};
// ── Application config ────────────────────────────────────────
const STAFF_APP_QUESTIONS = [
"How old are you?",
"What are your stats on DonutSMP?",
"What is your IGN?",
"How many giveaways can you make a week?",
"What would you do if someone was spamming racial slurs or inappropriate messages in chat?",
"Do you have any prior experience? If yes, name the servers and your role.",
];
const PM_APP_QUESTIONS = [
"What is your IGN?",
"What are your stats on DonutSMP?",
"How many partners can you make in a week?",
"Do you understand that breaking partner requirements can lead to a strike or demotion?",
"Do you have any prior experience? If yes, name the servers and your role.",
];

// ── Helper: parse number shortcuts (k / m / b) ───────────────
function parseNumber(input) {
if (input === null || input === undefined) return NaN;
const str = String(input).trim().toLowerCase().replace(/,/g, "");
const multipliers = { k: 1_000, m: 1_000_000, b: 1_000_000_000 };
const match = str.match(/^(\d+(\.\d+)?)([kmb]?)$/);
if (!match) return NaN;
const num = parseFloat(match[1]);
const suffix = match[3];
return suffix ? num * multipliers[suffix] : num;
}
// ── Helper: format large numbers back to readable string ──────
function formatNumber(num) {
if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(2).replace(/\.00$/, "") + "b";
if (num >= 1_000_000) return (num / 1_000_000).toFixed(2).replace(/\.00$/, "") + "m";
if (num >= 1_000) return (num / 1_000).toFixed(2).replace(/\.00$/, "") + "k";
return num.toString();
}
// ── Helper: consistent error embed ───────────────────────────
function errorEmbed(message) {
return new EmbedBuilder()
.setColor(0xe74c3c)
.setTitle(" Error")
.setDescription(message)
.setTimestamp();
}
// ── Helper: consistent success embed ─────────────────────────
function successEmbed(title, description) {
return new EmbedBuilder()
.setColor(0x2ecc71)
.setTitle(title)
.setDescription(description)
.setTimestamp();
}
// ============================================================
// SLASH COMMAND DEFINITIONS
// ============================================================
const commands = [
// ── MODERATION ───────────────────────────────────────────
new SlashCommandBuilder()

.setName("warn")
.setDescription("Warn a member")
.addUserOption(o => o.setName("user").setDescription("Member to warn").setRequired(true))
.addStringOption(o => o.setName("reason").setDescription("Reason for warning").setRequired(true))
.setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
new SlashCommandBuilder()
.setName("ban")
.setDescription("Ban a member from the server")
.addUserOption(o => o.setName("user").setDescription("Member to ban").setRequired(true))
.addStringOption(o => o.setName("reason").setDescription("Reason for ban").setRequired(false))
.setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
new SlashCommandBuilder()
.setName("unban")
.setDescription("Unban a user by their ID")
.addStringOption(o => o.setName("userid").setDescription("User ID to unban").setRequired(true))
.addStringOption(o => o.setName("reason").setDescription("Reason for unban").setRequired(false))
.setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
new SlashCommandBuilder()
.setName("timeout")
.setDescription("Timeout a member")
.addUserOption(o => o.setName("user").setDescription("Member to timeout").setRequired(true))
.addStringOption(o =>
o.setName("duration")
.setDescription("Duration (e.g. 10m, 1h, 7d — max 28d)")
.setRequired(true)
)
.addStringOption(o => o.setName("reason").setDescription("Reason for timeout").setRequired(false))
.setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
new SlashCommandBuilder()
.setName("untimeout")
.setDescription("Remove timeout from a member")
.addUserOption(o => o.setName("user").setDescription("Member to untimeout").setRequired(true))
.addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(false))
.setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
// ── ROLE MANAGEMENT ──────────────────────────────────────
new SlashCommandBuilder()
.setName("addrole")
.setDescription("Add a role to a member")
.addUserOption(o => o.setName("user").setDescription("Target member").setRequired(true))
.addRoleOption(o => o.setName("role").setDescription("Role to add").setRequired(true))
.setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

new SlashCommandBuilder()
.setName("removerole")
.setDescription("Remove a role from a member")
.addUserOption(o => o.setName("user").setDescription("Target member").setRequired(true))
.addRoleOption(o => o.setName("role").setDescription("Role to remove").setRequired(true))
.setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
// ── EMBED BUILDER ─────────────────────────────────────────
new SlashCommandBuilder()
.setName("embed")
.setDescription("Send a custom embed message")
.addStringOption(o => o.setName("title").setDescription("Embed title").setRequired(true))
.addStringOption(o => o.setName("description").setDescription("Embed description").setRequired(true))
.addStringOption(o =>
o.setName("color")
.setDescription("Hex color (e.g. #ff0000) — default: blurple")
.setRequired(false)
)
.setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
// ── SMOKER CALCULATOR ─────────────────────────────────────
new SlashCommandBuilder()
.setName("smoker")
.setDescription("Calculate total value of smokers (1 smoker = 200k)")
.addStringOption(o =>
o.setName("amount")
.setDescription("Number of smokers (supports k/m/b, e.g. 5k)")
.setRequired(true)
),
// ── SPAWNER CALCULATOR ────────────────────────────────────
new SlashCommandBuilder()
.setName("spawner")
.setDescription("Calculate spawner buy or sell total")
.addStringOption(o =>
o.setName("amount")
.setDescription("Number of spawners (supports k/m/b)")
.setRequired(true)
)
.addStringOption(o =>
o.setName("type")
.setDescription("Are you buying or selling?")
.setRequired(true)

.addChoices(
{ name: "Buying (you buy from server)", value: "buy" },
{ name: "Selling (you sell to server)", value: "sell" }
)
),
// ── SPAWNER PRICE CONFIG (Admin) ──────────────────────────
new SlashCommandBuilder()
.setName("setspawnerprice")
.setDescription("Set the spawner buy or sell price (Admin only)")
.addStringOption(o =>
o.setName("type")
.setDescription("Which price to update?")
.setRequired(true)
.addChoices(
{ name: "Buy price (server pays players)", value: "buy" },
{ name: "Sell price (players pay server)", value: "sell" }
)
)
.addStringOption(o =>
o.setName("price")
.setDescription("New price (supports k/m/b, e.g. 4.4m)")
.setRequired(true)
)
.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
// ── GIVEAWAY ─────────────────────────────────────────────
new SlashCommandBuilder()
.setName("giveaway")
.setDescription("Giveaway system")
.addSubcommand(sub =>
sub
.setName("normal")
.setDescription("Start a regular giveaway — picks a winner with no dork game")
.addStringOption(o => o.setName("prize").setDescription("Prize name / description").setRequired(true))
.addStringOption(o =>
o.setName("duration")
.setDescription("Duration (e.g. 1h, 30m, 2d)")
.setRequired(true)
)
.addStringOption(o =>
o.setName("description")
.setDescription("Extra description shown under the prize")
.setRequired(false)
)

)
.addSubcommand(sub =>
sub
.setName("dork")
.setDescription("Start a giveaway with the dork doubling game")
.addStringOption(o => o.setName("prize").setDescription("Prize name / description").setRequired(true))
.addStringOption(o =>
o.setName("duration")
.setDescription("Duration (e.g. 1h, 30m, 2d)")
.setRequired(true)
)
.addStringOption(o =>
o.setName("maxprize")
.setDescription("Max prize cap for doubling (e.g. 10m)")
.setRequired(true)
)
.addStringOption(o =>
o.setName("description")
.setDescription("Extra description shown under the prize")
.setRequired(false)
)
)
.addSubcommand(sub =>
sub
.setName("end")
.setDescription("Force-end a giveaway early")
.addStringOption(o =>
o.setName("messageid")
.setDescription("Message ID of the giveaway to end")
.setRequired(true)
)
)
.addSubcommand(sub =>
sub
.setName("track")
.setDescription("See how many giveaways a staff member has hosted")
.addUserOption(o =>
o.setName("user")
.setDescription("Staff member to check (defaults to yourself)")
.setRequired(false)
)
)
.addSubcommand(sub =>
sub
.setName("leaderboard")
.setDescription("See who has hosted the most giveaways")
)

.setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents),
// ── DONUT SMP: STATS ─────────────────────────────────────
new SlashCommandBuilder()
.setName("stats")
.setDescription("View a DonutSMP player's in-game stats")
.addStringOption(o =>
o.setName("username")
.setDescription("In-game username")
.setRequired(true)
),
// ── DONUT SMP: LOOKUP ─────────────────────────────────────
new SlashCommandBuilder()
.setName("lookup")
.setDescription("Look up a DonutSMP player's rank and location")
.addStringOption(o =>
o.setName("username")
.setDescription("In-game username")
.setRequired(true)
),
// ── DONUT SMP: AUCTION HOUSE ──────────────────────────────
new SlashCommandBuilder()
.setName("ah")
.setDescription("Search the DonutSMP Auction House for an item")
.addStringOption(o =>
o.setName("item")
.setDescription("Item name to search for (e.g. diamond, sword)")
.setRequired(true)
)
.addStringOption(o =>
o.setName("sort")
.setDescription("Sort order")
.setRequired(false)
.addChoices(
{ name: "Lowest Price", value: "lowest_price" },
{ name: "Highest Price", value: "highest_price" },
{ name: "Recently Listed", value: "recently_listed" },
{ name: "Last Listed", value: "last_listed" }
)
),
// ── DONUT SMP: AUCTION TRANSACTIONS ──────────────────────

new SlashCommandBuilder()
.setName("ah-recent")
.setDescription("View recent DonutSMP Auction House sales")
.addIntegerOption(o =>
o.setName("page")
.setDescription("Page number (1–10, 100 sales per page)")
.setRequired(false)
.setMinValue(1)
.setMaxValue(10)
),
// ── DONUT SMP: LEADERBOARD ───────────────────────────────
new SlashCommandBuilder()
.setName("leaderboard")
.setDescription("View DonutSMP leaderboards")
.addStringOption(o =>
o.setName("type")
.setDescription("Which leaderboard to view")
.setRequired(true)
.addChoices(
{ name: " Money", value: "money" },
{ name: " Kills", value: "kills" },
{ name: " Deaths", value: "deaths" },
{ name: " Playtime", value: "playtime" },
{ name: " Shards", value: "shards" },
{ name: " Most Sold (/sell)", value: "sell" },
{ name: " Most Spent (/shop)", value: "shop" },
{ name: " Mobs Killed", value: "mobskilled" },
{ name: " Blocks Broken", value: "brokenblocks" },
{ name: " Blocks Placed", value: "placedblocks" }
)
)
.addIntegerOption(o =>
o.setName("page")
.setDescription("Page number (default: 1)")
.setRequired(false)
.setMinValue(1)
),
// ── SPAWNER PRICE SEND ───────────────────────────────────
new SlashCommandBuilder()
.setName("spawnerpricesend")
.setDescription("Post the current spawner prices in the channel")
.setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

// ── TICKET PANEL ─────────────────────────────────────────
new SlashCommandBuilder()
.setName("ticketpanelsend")
.setDescription("Post the ticket panel in this channel")
.setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
// ── APPLICATION PANEL ────────────────────────────────────
new SlashCommandBuilder()
.setName("applicationpanelsend")
.setDescription("Post the staff application panel in this channel")
.setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
// ── VOUCH ─────────────────────────────────────────────────
new SlashCommandBuilder()
.setName("vouch")
.setDescription("Vouch for a user in FlamingGMR's server")
.addUserOption(o =>
o.setName("user")
.setDescription("The user you are vouching for")
.setRequired(true)
)
.addStringOption(o =>
o.setName("reason")
.setDescription("Why are you vouching for them?")
.setRequired(true)
),
// ── VOUCH COUNT ───────────────────────────────────────────
new SlashCommandBuilder()
.setName("vouchcount")
.setDescription("Check how many vouches a user has received")
.addUserOption(o =>
o.setName("user")
.setDescription("User to check (defaults to yourself)")
.setRequired(false)
),
// ── LOCK CHANNEL ──────────────────────────────────────────
new SlashCommandBuilder()
.setName("lockchannel")
.setDescription("Lock or unlock a channel so only staff can send messages")

.addStringOption(o =>
o.setName("action")
.setDescription("Lock or unlock")
.setRequired(true)
.addChoices(
{ name: "Lock", value: "lock" },
{ name: "Unlock", value: "unlock" }
)
)
.addStringOption(o =>
o.setName("reason")
.setDescription("Reason for locking")
.setRequired(false)
)
.setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
// ── EMBED ORGANIZED ───────────────────────────────────────
new SlashCommandBuilder()
.setName("embedorganized")
.setDescription("Create a customized embed using a popup form")
.setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
// ── PURGE ─────────────────────────────────────────────────
new SlashCommandBuilder()
.setName("purge")
.setDescription("Delete a specified number of recent messages")
.addIntegerOption(o =>
o.setName("amount")
.setDescription("Number of messages to delete (1-100)")
.setRequired(true)
.setMinValue(1)
.setMaxValue(100)
)
.setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
// ── TICKET RENAME ─────────────────────────────────────────
new SlashCommandBuilder()
.setName("ticketrename")
.setDescription("Rename the current ticket channel (only works inside a ticket)")
.addStringOption(o =>
o.setName("name")
.setDescription("New name for the ticket")
.setRequired(true)
)

.setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
// ── TICKET USER ADD ───────────────────────────────────────
new SlashCommandBuilder()
.setName("ticketuseradd")
.setDescription("Add a user to the current ticket")
.addUserOption(o =>
o.setName("user")
.setDescription("User to add")
.setRequired(true)
)
.setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
// ── TICKET USER REMOVE ────────────────────────────────────
new SlashCommandBuilder()
.setName("ticketuserremove")
.setDescription("Remove a user from the current ticket")
.addUserOption(o =>
o.setName("user")
.setDescription("User to remove")
.setRequired(true)
)
.setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
// ── PRICING ───────────────────────────────────────────────
new SlashCommandBuilder()
.setName("pricing")
.setDescription("View the current server pricing"),
// ── PRICING SET ───────────────────────────────────────────
new SlashCommandBuilder()
.setName("pricingset")
.setDescription("Set the pricing message (Founder only)"),
].map(cmd => cmd.toJSON());
// ============================================================
// REGISTER SLASH COMMANDS VIA REST
// ============================================================
async function registerCommands() {
const token = process.env.TOKEN;
const clientId = process.env.CLIENT_ID;

const guildId = process.env.GUILD_ID;
if (!token) throw new Error("Missing environment variable: TOKEN");
if (!clientId) throw new Error("Missing environment variable: CLIENT_ID");
const rest = new REST({ version: "10" }).setToken(token);
console.log(" Registering slash commands...");
try {
// Always wipe global commands first to prevent stale duplicates stacking
await rest.put(Routes.applicationCommands(clientId), { body: [] });
console.log(" Cleared global commands");
if (guildId) {
// Register to guild — updates instantly
await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
console.log(` Slash commands registered to guild ${guildId}`);
} else {
// Register globally — takes up to 1 hour to propagate
await rest.put(Routes.applicationCommands(clientId), { body: commands });
console.log(" Slash commands registered globally");
}
} catch (err) {
console.error(" Failed to register slash commands:", err);
throw err;
}
}
// ============================================================
// index.js — Part 2: Command Handlers
// ============================================================
// ── Helper: parse duration strings into milliseconds ─────────
// Accepts formats like 30s, 10m, 2h, 7d
function parseDuration(str) {
const match = String(str).trim().toLowerCase().match(/^(\d+(\.\d+)?)(s|m|h|d)$/);
if (!match) return NaN;
const value = parseFloat(match[1]);
const unit = match[3];
const map = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
return value * map[unit];
}
// ── Helper: build the giveaway embed ─────────────────────────
function buildGiveawayEmbed(data) {
const endTimestamp = Math.floor(data.endsAt / 1000);

let desc = `**${data.prize}**`;
if (data.description) desc += `\n${data.description}`;
desc += `\n\n Ending: <t:${endTimestamp}:R>`;
desc += `\n Host: <@${data.hostId}>`;
desc += `\n Entries: **${data.entries.length}**`;
const embed = new EmbedBuilder()
.setColor(0xf1c40f)
.setTitle(" GIVEAWAY ")
.setDescription(desc)
.setTimestamp(data.endsAt);
if (data.maxPrize !== null && data.maxPrize !== undefined) {
embed.setFooter({ text: `Max prize cap: ${formatNumber(data.maxPrize)}` });
}
return embed;
}
// ── Helper: build dork buttons ────────────────────────────────
function buildDorkRow(currentPrize, maxPrize, dorkId, forceDisableDouble = false) {
const doubled = currentPrize * 2;
const canDouble = !forceDisableDouble && doubled <= maxPrize && currentPrize > 0;
const keepBtn = new ButtonBuilder()
.setCustomId(`dork_keep_${dorkId}`)
.setLabel(" Keep")
.setStyle(ButtonStyle.Success);
const doubleLabel = forceDisableDouble
? " Double (N/A)"
: ` Double (→ ${formatNumber(doubled)})`;
const doubleBtn = new ButtonBuilder()
.setCustomId(`dork_double_${dorkId}`)
.setLabel(doubleLabel)
.setStyle(ButtonStyle.Danger)
.setDisabled(!canDouble);
return new ActionRowBuilder().addComponents(keepBtn, doubleBtn);
}
// ============================================================
// INTERACTION HANDLER
// ============================================================
client.on("interactionCreate", async (interaction) => {

// ── Button interactions — wrapped in try/catch to prevent silent timeout ──
if (interaction.isButton()) {
try {
return await handleButton(interaction);
} catch (err) {
console.error(" Error handling button interaction:", err);
const reply = { embeds: [errorEmbed("Something went wrong with that button.")], flags: MessageFlags.Ephemeral };
if (interaction.replied || interaction.deferred) return interaction.followUp(reply);
return interaction.reply(reply);
}
}
// ── Modal submissions (ticket close reason, future modals) ──
if (interaction.isModalSubmit()) {
try {
const cid = interaction.customId;
if (cid.startsWith("ticket_close_reason_")) {
const channelId = cid.replace("ticket_close_reason_", "");
return await handleTicketCloseModal(interaction, channelId);
}
// Embed organized modal
if (cid === "embedorganized_modal") {
const title = interaction.fields.getTextInputValue("embed_title");
const description = interaction.fields.getTextInputValue("embed_description");
let footer = "";
try { footer = interaction.fields.getTextInputValue("embed_footer").trim(); } catch { footer = ""; }
const embed = new EmbedBuilder()
.setColor(0x1e40af)
.setTitle(title)
.setDescription(description)
.setTimestamp();
if (footer) embed.setFooter({ text: footer });
await interaction.reply({ content: "Embed sent!", flags: MessageFlags.Ephemeral });
return interaction.channel.send({ embeds: [embed] });
}
// Pricing set modal
if (cid === "pricingset_modal") {
pricingMessage = interaction.fields.getTextInputValue("pricing_text");
return interaction.reply({
embeds: [
new EmbedBuilder()
.setColor(0x2ecc71)

.setTitle("Pricing Updated")
.setDescription("The pricing message has been updated. Users can now view it with `/pricing`.")
.setTimestamp(),
],
flags: MessageFlags.Ephemeral,
});
}
// Deny reason modal for application rejection
if (cid.startsWith("deny_reason_")) {
const parts = cid.replace("deny_reason_", "").split("_");
const appType = parts.pop(); // last segment is type
const userId = parts.join("_"); // everything before is userId
return await handleDenyReasonModal(interaction, userId, appType);
}
} catch (err) {
console.error(" Error handling modal submission:", err);
const reply = { embeds: [errorEmbed("Something went wrong with that form.")], flags: MessageFlags.Ephemeral };
if (interaction.replied || interaction.deferred) return interaction.followUp(reply);
return interaction.reply(reply);
}
return;
}
if (!interaction.isChatInputCommand()) return;
const { commandName } = interaction;
try {
// ==========================================================
// MODERATION: /warn
// ==========================================================
if (commandName === "warn") {
const target = interaction.options.getUser("user");
const reason = interaction.options.getString("reason");
const member = await interaction.guild.members.fetch(target.id).catch(() => null);
if (!member) {
return interaction.reply({ embeds: [errorEmbed("That user is not in this server.")], flags: MessageFlags.Ephemeral });
}
const avatarUrl = target.displayAvatarURL({ forceStatic: false });
const embed = new EmbedBuilder()
.setColor(0xf39c12)
.setTitle("Member Warned")

.addFields(
{ name: "User", value: `<@${target.id}> (${target.username})`, inline: true },
{ name: "Moderator", value: `<@${interaction.user.id}>`, inline: true },
{ name: "Reason", value: reason }
)
.setThumbnail(avatarUrl ?? null)
.setTimestamp();
return interaction.reply({ embeds: [embed] });
}
// ==========================================================
// MODERATION: /ban
// ==========================================================
if (commandName === "ban") {
const target = interaction.options.getUser("user");
const reason = interaction.options.getString("reason") ?? "No reason provided";
const member = await interaction.guild.members.fetch(target.id).catch(() => null);
if (!member) {
return interaction.reply({ embeds: [errorEmbed("That user is not in this server.")], flags: MessageFlags.Ephemeral });
}
if (!member.bannable) {
return interaction.reply({ embeds: [errorEmbed("I cannot ban that user. They may have a higher role than me.")], flags: MessageFlags.Ephemeral });
}
await member.ban({ reason });
const embed = new EmbedBuilder()
.setColor(0xe74c3c)
.setTitle(" Member Banned")
.addFields(
{ name: " User", value: `<@${target.id}> (${target.username})`, inline: true },
{ name: " Moderator", value: `<@${interaction.user.id}>`, inline: true },
{ name: " Reason", value: reason }
)
.setThumbnail(target.displayAvatarURL({ forceStatic: false }) ?? null)
.setTimestamp();
return interaction.reply({ embeds: [embed] });
}
// ==========================================================
// MODERATION: /unban
// ==========================================================
if (commandName === "unban") {
const userId = interaction.options.getString("userid").trim();

const reason = interaction.options.getString("reason") ?? "No reason provided";
let user;
try {
user = await client.users.fetch(userId);
} catch {
return interaction.reply({ embeds: [errorEmbed("Could not find a user with that ID.")], flags: MessageFlags.Ephemeral });
}
try {
await interaction.guild.members.unban(userId, reason);
} catch {
return interaction.reply({ embeds: [errorEmbed("That user is not banned or I lack permission.")], flags: MessageFlags.Ephemeral });
}
const embed = new EmbedBuilder()
.setColor(0x2ecc71)
.setTitle(" Member Unbanned")
.addFields(
{ name: " User", value: `${user.username} (${userId})`, inline: true },
{ name: " Moderator", value: `<@${interaction.user.id}>`, inline: true },
{ name: " Reason", value: reason }
)
.setThumbnail(user.displayAvatarURL({ forceStatic: false }) ?? null)
.setTimestamp();
return interaction.reply({ embeds: [embed] });
}
// ==========================================================
// MODERATION: /timeout
// ==========================================================
if (commandName === "timeout") {
const target = interaction.options.getUser("user");
const durStr = interaction.options.getString("duration");
const reason = interaction.options.getString("reason") ?? "No reason provided";
const durationMs = parseDuration(durStr);
if (isNaN(durationMs)) {
return interaction.reply({ embeds: [errorEmbed("Invalid duration. Use formats like `10m`, `1h`, `7d`.")], flags: MessageFlags.Ephemeral });
}
const maxTimeout = 28 * 24 * 60 * 60 * 1000; // 28 days in ms
if (durationMs > maxTimeout) {
return interaction.reply({ embeds: [errorEmbed("Maximum timeout duration is 28 days.")], flags: MessageFlags.Ephemeral });
}

const member = await interaction.guild.members.fetch(target.id).catch(() => null);
if (!member) {
return interaction.reply({ embeds: [errorEmbed("That user is not in this server.")], flags: MessageFlags.Ephemeral });
}
if (!member.moderatable) {
return interaction.reply({ embeds: [errorEmbed("I cannot timeout that user. They may have a higher role than me.")], flags: MessageFlags.Ephemeral });
}
await member.timeout(durationMs, reason);
const endsAt = Math.floor((Date.now() + durationMs) / 1000);
const embed = new EmbedBuilder()
.setColor(0xe67e22)
.setTitle(" Member Timed Out")
.addFields(
{ name: " User", value: `<@${target.id}> (${target.username})`, inline: true },
{ name: " Moderator", value: `<@${interaction.user.id}>`, inline: true },
{ name: " Expires", value: `<t:${endsAt}:R>`, inline: true },
{ name: " Reason", value: reason }
)
.setThumbnail(target.displayAvatarURL({ forceStatic: false }) ?? null)
.setTimestamp();
return interaction.reply({ embeds: [embed] });
}
// ==========================================================
// MODERATION: /untimeout
// ==========================================================
if (commandName === "untimeout") {
const target = interaction.options.getUser("user");
const reason = interaction.options.getString("reason") ?? "No reason provided";
const member = await interaction.guild.members.fetch(target.id).catch(() => null);
if (!member) {
return interaction.reply({ embeds: [errorEmbed("That user is not in this server.")], flags: MessageFlags.Ephemeral });
}
if (!member.isCommunicationDisabled()) {
return interaction.reply({ embeds: [errorEmbed("That user is not currently timed out.")], flags: MessageFlags.Ephemeral });
}
await member.timeout(null, reason);
const embed = new EmbedBuilder()
.setColor(0x2ecc71)
.setTitle(" Timeout Removed")

.addFields(
{ name: " User", value: `<@${target.id}> (${target.username})`, inline: true },
{ name: " Moderator", value: `<@${interaction.user.id}>`, inline: true },
{ name: " Reason", value: reason }
)
.setThumbnail(target.displayAvatarURL({ forceStatic: false }) ?? null)
.setTimestamp();
return interaction.reply({ embeds: [embed] });
}
// ==========================================================
// ROLE MANAGEMENT: /addrole
// ==========================================================
if (commandName === "addrole") {
const target = interaction.options.getUser("user");
const role = interaction.options.getRole("role");
const member = await interaction.guild.members.fetch(target.id).catch(() => null);
if (!member) {
return interaction.reply({ embeds: [errorEmbed("That user is not in this server.")], flags: MessageFlags.Ephemeral });
}
if (member.roles.cache.has(role.id)) {
return interaction.reply({ embeds: [errorEmbed(`<@${target.id}> already has the <@&${role.id}> role.`)], flags: MessageFlags.Ephemeral });
}
if (!role.editable) {
return interaction.reply({ embeds: [errorEmbed("I cannot assign that role. It may be higher than my highest role.")], flags: MessageFlags.Ephemeral });
}
await member.roles.add(role);
const embed = new EmbedBuilder()
.setColor(0x3498db)
.setTitle(" Role Added")
.addFields(
{ name: " User", value: `<@${target.id}> (${target.username})`, inline: true },
{ name: " Role", value: `<@&${role.id}>`, inline: true },
{ name: " Moderator", value: `<@${interaction.user.id}>`, inline: true }
)
.setTimestamp();
return interaction.reply({ embeds: [embed] });
}
// ==========================================================
// ROLE MANAGEMENT: /removerole
// ==========================================================

if (commandName === "removerole") {
const target = interaction.options.getUser("user");
const role = interaction.options.getRole("role");
const member = await interaction.guild.members.fetch(target.id).catch(() => null);
if (!member) {
return interaction.reply({ embeds: [errorEmbed("That user is not in this server.")], flags: MessageFlags.Ephemeral });
}
if (!member.roles.cache.has(role.id)) {
return interaction.reply({ embeds: [errorEmbed(`<@${target.id}> does not have the <@&${role.id}> role.`)], flags: MessageFlags.Ephemeral });
}
if (!role.editable) {
return interaction.reply({ embeds: [errorEmbed("I cannot remove that role. It may be higher than my highest role.")], flags: MessageFlags.Ephemeral });
}
await member.roles.remove(role);
const embed = new EmbedBuilder()
.setColor(0xe74c3c)
.setTitle(" Role Removed")
.addFields(
{ name: " User", value: `<@${target.id}> (${target.username})`, inline: true },
{ name: " Role", value: `<@&${role.id}>`, inline: true },
{ name: " Moderator", value: `<@${interaction.user.id}>`, inline: true }
)
.setTimestamp();
return interaction.reply({ embeds: [embed] });
}
// ==========================================================
// EMBED BUILDER: /embed
// ==========================================================
if (commandName === "embed") {
const title = interaction.options.getString("title");
const description = interaction.options.getString("description");
const colorInput = interaction.options.getString("color");
let color = 0x5865f2; // Discord blurple default
if (colorInput) {
const hex = colorInput.replace("#", "");
const parsed = parseInt(hex, 16);
if (isNaN(parsed)) {
return interaction.reply({ embeds: [errorEmbed("Invalid hex color. Example: `#ff0000`")], flags: MessageFlags.Ephemeral });
}
color = parsed;
}

const embed = new EmbedBuilder()
.setColor(color)
.setTitle(title)
.setDescription(description)
.setFooter({ text: `Posted by ${interaction.user.username}` })
.setTimestamp();
// Confirm to the command user (ephemeral), then send the real embed
await interaction.reply({ content: " Embed sent!", flags: MessageFlags.Ephemeral });
return interaction.channel.send({ embeds: [embed] });
}
// ==========================================================
// SMOKER CALCULATOR: /smoker
// ==========================================================
if (commandName === "smoker") {
const amountStr = interaction.options.getString("amount");
const amount = parseNumber(amountStr);
if (isNaN(amount) || amount <= 0) {
return interaction.reply({ embeds: [errorEmbed("Invalid amount. Use a number like `50`, `5k`, `2.5m`.")], flags: MessageFlags.Ephemeral });
}
const valuePerSmoker = 200_000;
const total = amount * valuePerSmoker;
const embed = new EmbedBuilder()
.setColor(0x9b59b6)
.setTitle(" Smoker Calculator")
.addFields(
{ name: " Smokers", value: formatNumber(amount), inline: true },
{ name: " Value/Smoker", value: formatNumber(valuePerSmoker), inline: true },
{ name: " Total Value", value: `**${formatNumber(total)}**`, inline: false }
)
.setFooter({ text: "1 smoker = 200k" })
.setTimestamp();
return interaction.reply({ embeds: [embed] });
}
// ==========================================================
// SPAWNER CALCULATOR: /spawner
// ==========================================================
if (commandName === "spawner") {
const amountStr = interaction.options.getString("amount");
const type = interaction.options.getString("type"); // "buy" or "sell"

const amount = parseNumber(amountStr);
if (isNaN(amount) || amount <= 0) {
return interaction.reply({ embeds: [errorEmbed("Invalid amount. Use a number like `10`, `5k`, `2m`.")], flags: MessageFlags.Ephemeral });
}
const isBuying = type === "buy";
const priceEach = isBuying ? spawnerConfig.sellPrice : spawnerConfig.buyPrice;
const total = amount * priceEach;
const actionText = isBuying ? "You pay the server" : "Server pays you";
const color = isBuying ? 0xe74c3c : 0x2ecc71;
const emoji = isBuying ? " " : " ";
const embed = new EmbedBuilder()
.setColor(color)
.setTitle(`${emoji} Spawner ${isBuying ? "Purchase" : "Sale"} Calculator`)
.addFields(
{ name: " Spawners", value: formatNumber(amount), inline: true },
{ name: " Price Each", value: formatNumber(priceEach), inline: true },
{ name: " Transaction", value: actionText, inline: true },
{ name: " Total", value: `**${formatNumber(total)}**`, inline: false }
)
.setFooter({
text: `Server sells for: ${formatNumber(spawnerConfig.sellPrice)} each | Server buys for: ${formatNumber(spawnerConfig.buyPrice)} each`
})
.setTimestamp();
return interaction.reply({ embeds: [embed] });
}
// ==========================================================
// SPAWNER PRICE CONFIG: /setspawnerprice
// ==========================================================
if (commandName === "setspawnerprice") {
const type = interaction.options.getString("type"); // "buy" or "sell"
const priceStr = interaction.options.getString("price");
const price = parseNumber(priceStr);
if (isNaN(price) || price <= 0) {
return interaction.reply({ embeds: [errorEmbed("Invalid price. Use a number like `4.4m`, `5200000`, `5.2m`.")], flags: MessageFlags.Ephemeral });
}
if (type === "buy") {
spawnerConfig.buyPrice = price;
} else {
spawnerConfig.sellPrice = price;
}

const label = type === "buy" ? "Buy Price (server pays players)" : "Sell Price (players pay server)";
const embed = new EmbedBuilder()
.setColor(0x2ecc71)
.setTitle(" Spawner Price Updated")
.addFields(
{ name: " Type", value: label, inline: false },
{ name: " New Price", value: formatNumber(price), inline: true },
{ name: " Updated by", value: `<@${interaction.user.id}>`, inline: true }
)
.setFooter({
text: `Current prices — Buy: ${formatNumber(spawnerConfig.buyPrice)} | Sell: ${formatNumber(spawnerConfig.sellPrice)}`
})
.setTimestamp();
return interaction.reply({ embeds: [embed] });
}
// ==========================================================
// SPAWNER PRICE SEND: /spawnerpricesend
// ==========================================================
if (commandName === "spawnerpricesend") {
const embed = new EmbedBuilder()
.setColor(0xf1c40f)
.setTitle(" Spawner Prices")
.addFields(
{
name: " We Buy For",
value: `**$${formatNumber(spawnerConfig.buyPrice)}** per spawner`,
inline: false,
},
{
name: " We Sell For",
value: `**$${formatNumber(spawnerConfig.sellPrice)}** per spawner`,
inline: false,
},
{
name: "",
value: "**We never go first and if you are going with owner we only go all at once**",
inline: false,
}
)
.setTimestamp();
await interaction.reply({ content: " Spawner prices posted!", flags: MessageFlags.Ephemeral });
return interaction.channel.send({ embeds: [embed] });

}
// ==========================================================
// API Part 2: DonutSMP Command Handlers
// ==========================================================
// ==========================================================
// DONUT SMP: /stats
// ==========================================================
if (commandName === "stats") {
const username = interaction.options.getString("username");
await interaction.deferReply();
const result = await donutAPI(`/v1/stats/${encodeURIComponent(username)}`);
if (!result.ok) {
return interaction.editReply({ embeds: [errorEmbed(result.message)] });
}
const s = result.data.result;
const money = parseFloat(s.money) || 0;
const embed = new EmbedBuilder()
.setColor(0x3498db)
.setTitle(` Stats — ${username}`)
.setThumbnail(`https://mc-heads.net/avatar/${encodeURIComponent(username)}/64`)
.addFields(
{ name: " Balance", value: `$${formatNumber(money)}`, inline: true },
{ name: " Shards", value: String(s.shards ?? "0"), inline: true },
{ name: " Kills", value: String(s.kills ?? "0"), inline: true },
{ name: " Deaths", value: String(s.deaths ?? "0"), inline: true },
{ name: " Mobs Killed", value: String(s.mobs_killed ?? "0"), inline: true },
{ name: " Playtime", value: formatPlaytime(s.playtime ?? 0), inline: true },
{ name: " Blocks Broken", value: String(s.broken_blocks ?? "0"), inline: true },
{ name: " Blocks Placed", value: String(s.placed_blocks ?? "0"), inline: true },
{ name: " Earned from /sell", value: `$${formatNumber(parseFloat(s.money_made_from_sell) || 0)}`, inline: true },
{ name: " Spent on /shop", value: `$${formatNumber(parseFloat(s.money_spent_on_shop) || 0)}`, inline: true }
)
.setFooter({ text: "DonutSMP Stats" })
.setTimestamp();
return interaction.editReply({ embeds: [embed] });
}
// ==========================================================
// DONUT SMP: /lookup
// ==========================================================
if (commandName === "lookup") {

const username = interaction.options.getString("username");
await interaction.deferReply();
const result = await donutAPI(`/v1/lookup/${encodeURIComponent(username)}`);
if (!result.ok) {
return interaction.editReply({ embeds: [errorEmbed(result.message)] });
}
const p = result.data.result;
const embed = new EmbedBuilder()
.setColor(0x9b59b6)
.setTitle(` Lookup — ${p.username ?? username}`)
.setThumbnail(`https://mc-heads.net/avatar/${encodeURIComponent(username)}/64`)
.addFields(
{ name: " Username", value: p.username ?? username, inline: true },
{ name: " Rank", value: p.rank ?? "None", inline: true },
{ name: " Location", value: p.location ?? "Unknown", inline: true }
)
.setFooter({ text: "DonutSMP Lookup" })
.setTimestamp();
return interaction.editReply({ embeds: [embed] });
}
// ==========================================================
// DONUT SMP: /ah
// ==========================================================
if (commandName === "ah") {
const item = interaction.options.getString("item");
const sort = interaction.options.getString("sort") ?? "lowest_price";
await interaction.deferReply();
const result = await donutAPI(`/v1/auction/list/1`, {
method: "POST",
body: JSON.stringify({ search: item, sort }),
});
if (!result.ok) {
return interaction.editReply({ embeds: [errorEmbed(result.message)] });
}
const listings = result.data.result;
if (!listings || listings.length === 0) {
return interaction.editReply({
embeds: [errorEmbed(`No auction listings found for **${item}**.`)],
});

}
// Filter to listings posted in the last 24 hours
const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
const recent = listings.filter(entry => {
if (!entry.listed_at && !entry.createdAt && !entry.timestamp) return true; // keep if no date field
const ts = entry.listed_at ?? entry.createdAt ?? entry.timestamp;
const ms = typeof ts === "number" && ts > 1e10 ? ts : ts * 1000;
return ms >= oneDayAgo;
});
if (recent.length === 0) {
return interaction.editReply({
embeds: [errorEmbed(`No auction listings found for **${item}** in the last 24 hours.`)],
});
}
// Show top 10 results max to avoid embed overflow
const shown = recent.slice(0, 10);
const lines = shown.map((entry, i) => {
const name = entry.item?.display_name ?? entry.item?.id ?? "Unknown Item";
const count = entry.item?.count > 1 ? ` x${entry.item.count}` : "";
const price = `$${formatNumber(entry.price ?? 0)}`;
const seller = entry.seller?.name ?? "Unknown";
const timeLeft = formatTimeLeft(entry.time_left ?? 0);
const enchants = formatEnchants(entry.item?.enchants);
const enchantStr = enchants ? ` *(${enchants})*` : "";
return `**${i + 1}.** ${name}${count}${enchantStr}\n└ ${price} | ${seller} | ${timeLeft}`;
});
const embed = new EmbedBuilder()
.setColor(0xf1c40f)
.setTitle(` Auction House — "${item}"`)
.setDescription(lines.join("\n\n"))
.setFooter({ text: `Showing ${shown.length} of ${recent.length} results (last 24h) • Sorted by ${sort.replace(/_/g, " ")}` })
.setTimestamp();
return interaction.editReply({ embeds: [embed] });
}
// ==========================================================
// DONUT SMP: /ah-recent
// ==========================================================
if (commandName === "ah-recent") {
const page = interaction.options.getInteger("page") ?? 1;
await interaction.deferReply();

const result = await donutAPI(`/v1/auction/transactions/${page}`);
if (!result.ok) {
return interaction.editReply({ embeds: [errorEmbed(result.message)] });
}
const transactions = result.data.result;
if (!transactions || transactions.length === 0) {
return interaction.editReply({
embeds: [errorEmbed("No recent auction transactions found.")],
});
}
const shown = transactions.slice(0, 10);
const lines = shown.map((entry, i) => {
const name = entry.item?.display_name ?? entry.item?.id ?? "Unknown Item";
const count = entry.item?.count > 1 ? ` x${entry.item.count}` : "";
const price = `$${formatNumber(entry.price ?? 0)}`;
const seller = entry.seller?.name ?? "Unknown";
const soldAt = entry.unixMillisDateSold
? `<t:${Math.floor(entry.unixMillisDateSold / 1000)}:R>`
: "Unknown";
const enchants = formatEnchants(entry.item?.enchants);
const enchantStr = enchants ? ` *(${enchants})*` : "";
return `**${i + 1}.** ${name}${count}${enchantStr}\n└ ${price} | ${seller} | ${soldAt}`;
});
const embed = new EmbedBuilder()
.setColor(0xe67e22)
.setTitle(` Recent Auction Sales — Page ${page}`)
.setDescription(lines.join("\n\n"))
.setFooter({ text: `Showing ${shown.length} of ${transactions.length} on this page • 100 per page` })
.setTimestamp();
return interaction.editReply({ embeds: [embed] });
}
// ==========================================================
// DONUT SMP: /leaderboard
// ==========================================================
if (commandName === "leaderboard") {
const type = interaction.options.getString("type");
const page = interaction.options.getInteger("page") ?? 1;
await interaction.deferReply();
const result = await donutAPI(`/v1/leaderboards/${type}/${page}`);

if (!result.ok) {
return interaction.editReply({ embeds: [errorEmbed(result.message)] });
}
const entries = result.data.result;
if (!entries || entries.length === 0) {
return interaction.editReply({
embeds: [errorEmbed("No leaderboard data found for that page.")],
});
}
const medals = [" ", " ", " "];
const startRank = (page - 1) * entries.length + 1;
const lbMeta = {
money: { label: " Money Leaderboard", unit: "$", isNumber: true },
kills: { label: " Kills Leaderboard", unit: "", isNumber: false },
deaths: { label: " Deaths Leaderboard", unit: "", isNumber: false },
playtime: { label: " Playtime Leaderboard", unit: "", isNumber: false, isTime: true },
shards: { label: " Shards Leaderboard", unit: "", isNumber: false },
sell: { label: " Most Earned (/sell)", unit: "$", isNumber: true },
shop: { label: " Most Spent (/shop)", unit: "$", isNumber: true },
mobskilled: { label: " Mobs Killed Leaderboard", unit: "", isNumber: false },
brokenblocks: { label: " Blocks Broken Leaderboard", unit: "", isNumber: false },
placedblocks: { label: " Blocks Placed Leaderboard", unit: "", isNumber: false },
};
const meta = lbMeta[type] ?? { label: `${type} Leaderboard`, unit: "", isNumber: false };
const lines = entries.map((entry, i) => {
const rank = startRank + i;
const medal = rank <= 3 ? medals[rank - 1] : `**${rank}.**`;
const username = entry.username ?? "Unknown";
let value = entry.value ?? "0";
if (meta.isTime) value = formatPlaytime(value);
else if (meta.isNumber) value = `${meta.unit}${formatNumber(parseFloat(value) || 0)}`;
else value = `${meta.unit}${value}`;
return `${medal} ${username} — ${value}`;
});
const embed = new EmbedBuilder()
.setColor(0xf1c40f)
.setTitle(meta.label)
.setDescription(lines.join("\n"))
.setFooter({ text: `Page ${page}` })

.setTimestamp();
return interaction.editReply({ embeds: [embed] });
}

// ==========================================================
// TICKET PANEL: /ticketpanelsend
// ==========================================================
if (commandName === "ticketpanelsend") return handleTicketPanelSend(interaction);
// ==========================================================
// APPLICATION PANEL: /applicationpanelsend — handled in Part 3
// ==========================================================
if (commandName === "applicationpanelsend") return handleApplicationPanelSend(interaction);
// ==========================================================
// VOUCH: /vouch
// ==========================================================
if (commandName === "vouch") {
const target = interaction.options.getUser("user");
const reason = interaction.options.getString("reason");
// Prevent self-vouching
if (target.id === interaction.user.id) {
return interaction.reply({
embeds: [errorEmbed("You cannot vouch for yourself.")],
flags: MessageFlags.Ephemeral,
});
}
// Prevent vouching for bots
if (target.bot) {
return interaction.reply({
embeds: [errorEmbed("You cannot vouch for a bot.")],
flags: MessageFlags.Ephemeral,
});
}
const vouchChannelId = process.env.VOUCH_CHANNEL_ID;
if (!vouchChannelId) {
return interaction.reply({
embeds: [errorEmbed("Vouch channel not configured. Ask the server owner to set `VOUCH_CHANNEL_ID` on Railway.")],
flags: MessageFlags.Ephemeral,
});
}

let vouchChannel;
try {
vouchChannel = await client.channels.fetch(vouchChannelId);
} catch {
return interaction.reply({
embeds: [errorEmbed("Could not find the vouch channel. Check the `VOUCH_CHANNEL_ID` on Railway.")],
flags: MessageFlags.Ephemeral,
});
}
// Store vouch in memory
const existing = vouchStore.get(target.id) ?? [];
existing.push({ fromId: interaction.user.id, reason, timestamp: Date.now() });
vouchStore.set(target.id, existing);
const totalVouches = existing.length;
const embed = new EmbedBuilder()
.setColor(0x2ecc71)
.setTitle("+ Vouch")
.setDescription(
`<@${interaction.user.id}> vouched for <@${target.id}>\n\n` +
`**Reason:** ${reason}`
)
.setFooter({ text: `${target.username} now has ${totalVouches} vouch${totalVouches === 1 ? "" : "es"} • ${interaction.guild.name}` })
.setTimestamp();
await vouchChannel.send({ embeds: [embed] });
return interaction.reply({
embeds: [
new EmbedBuilder()
.setColor(0x2ecc71)
.setTitle("Vouch Posted")
.setDescription(`Your vouch for <@${target.id}> has been posted in <#${vouchChannelId}>.
They now have **${totalVouches}** vouch${totalVouches === 1 ? "" : "es"}.`)
.setTimestamp(),
],
flags: MessageFlags.Ephemeral,
});
}
// ==========================================================
// VOUCHCOUNT: /vouchcount
// ==========================================================
if (commandName === "vouchcount") {
const target = interaction.options.getUser("user") ?? interaction.user;
const vouches = vouchStore.get(target.id) ?? [];

const count = vouches.length;
return interaction.reply({
embeds: [
new EmbedBuilder()
.setColor(0x1e40af)
.setTitle(`Vouches for ${target.username}`)
.setDescription(count === 0
? `${target.username} has no vouches yet.`
: `<@${target.id}> has **${count}** vouch${count === 1 ? "" : "es"}.`
)
.setTimestamp(),
],
});
}
// ==========================================================
// LOCKCHANNEL: /lockchannel
// ==========================================================
if (commandName === "lockchannel") {
const action = interaction.options.getString("action");
const reason = interaction.options.getString("reason") ?? "No reason provided";
const channel = interaction.channel;
const staffRoleId = process.env.TICKET_STAFF_ROLE_ID;
try {
if (action === "lock") {
// Deny @everyone from sending
await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
SendMessages: false,
});
// Keep staff able to send if role set
if (staffRoleId) {
await channel.permissionOverwrites.edit(staffRoleId, {
SendMessages: true,
});
}
return interaction.reply({
embeds: [
new EmbedBuilder()
.setColor(0xe74c3c)
.setTitle("Channel Locked")
.setDescription(`This channel has been locked by <@${interaction.user.id}>.
**Reason:** ${reason}`)
.setTimestamp(),
],
});

} else {
await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
SendMessages: null,
});
return interaction.reply({
embeds: [
new EmbedBuilder()
.setColor(0x2ecc71)
.setTitle("Channel Unlocked")
.setDescription(`This channel has been unlocked by <@${interaction.user.id}>.
**Reason:** ${reason}`)
.setTimestamp(),
],
});
}
} catch (err) {
console.error(" lockchannel error:", err);
return interaction.reply({
embeds: [errorEmbed("Failed to update channel permissions. Make sure I have Manage Channel permission.")],
flags: MessageFlags.Ephemeral,
});
}
}
// ==========================================================
// EMBEDORGANIZED: /embedorganized
// ==========================================================
if (commandName === "embedorganized") {
const modal = new ModalBuilder()
.setCustomId("embedorganized_modal")
.setTitle("Create Embed");
modal.addComponents(
new ActionRowBuilder().addComponents(
new TextInputBuilder()
.setCustomId("embed_title")
.setLabel("Title")
.setStyle(TextInputStyle.Short)
.setPlaceholder("Enter the embed title...")
.setRequired(true)
.setMaxLength(256)
),
new ActionRowBuilder().addComponents(
new TextInputBuilder()
.setCustomId("embed_description")
.setLabel("Description")

.setStyle(TextInputStyle.Paragraph)
.setPlaceholder("Enter the embed description. You can use multiple lines freely.")
.setRequired(true)
.setMaxLength(4000)
),
new ActionRowBuilder().addComponents(
new TextInputBuilder()
.setCustomId("embed_footer")
.setLabel("Footer (optional)")
.setStyle(TextInputStyle.Short)
.setPlaceholder("Optional footer text...")
.setRequired(false)
.setMaxLength(2048)
),
);
return interaction.showModal(modal);
}
// ==========================================================
// PURGE: /purge
// ==========================================================
if (commandName === "purge") {
const amount = interaction.options.getInteger("amount");
await interaction.deferReply({ flags: MessageFlags.Ephemeral });
try {
const messages = await interaction.channel.bulkDelete(amount, true);
return interaction.editReply({
embeds: [
new EmbedBuilder()
.setColor(0x1e40af)
.setTitle("Messages Purged")
.setDescription(`Deleted **${messages.size}** message${messages.size === 1 ? "" : "s"}.`)
.setFooter({ text: `Purged by ${interaction.user.username}` })
.setTimestamp(),
],
});
} catch (err) {
console.error(" purge error:", err);
return interaction.editReply({
embeds: [errorEmbed("Failed to delete messages. Messages older than 14 days cannot be bulk deleted.")],
});
}
}
// ==========================================================
// TICKET RENAME: /ticketrename

// ==========================================================
if (commandName === "ticketrename") {
const newName = interaction.options.getString("name").toLowerCase().replace(/\s+/g, "-");
const channel = interaction.channel;
// Check if we're inside a ticket channel (any known prefix)
const ticketPrefixes = ["support-","giveaway-","spawner-","partnership-","member-report-","staff-report-","building-","mysterybox-"];
const isTicket = ticketPrefixes.some(p => channel.name.startsWith(p));
if (!isTicket) {
return interaction.reply({
embeds: [errorEmbed("This command can only be used inside a ticket channel.")],
flags: MessageFlags.Ephemeral,
});
}
try {
await channel.setName(newName);
return interaction.reply({
embeds: [
new EmbedBuilder()
.setColor(0x1e40af)
.setTitle("Ticket Renamed")
.setDescription(`Channel renamed to **${newName}** by <@${interaction.user.id}>.`)
.setTimestamp(),
],
});
} catch (err) {
console.error(" ticketrename error:", err);
return interaction.reply({
embeds: [errorEmbed("Failed to rename the channel.")],
flags: MessageFlags.Ephemeral,
});
}
}
// ==========================================================
// TICKET USER ADD: /ticketuseradd
// ==========================================================
if (commandName === "ticketuseradd") {
const target = interaction.options.getUser("user");
const channel = interaction.channel;
const ticketPrefixes = ["support-","giveaway-","spawner-","partnership-","member-report-","staff-report-","building-","mysterybox-"];
const isTicket = ticketPrefixes.some(p => channel.name.startsWith(p));
if (!isTicket) {
return interaction.reply({

embeds: [errorEmbed("This command can only be used inside a ticket channel.")],
flags: MessageFlags.Ephemeral,
});
}
try {
await channel.permissionOverwrites.edit(target.id, {
ViewChannel: true,
SendMessages: true,
ReadMessageHistory: true,
});
return interaction.reply({
embeds: [
new EmbedBuilder()
.setColor(0x2ecc71)
.setTitle("User Added to Ticket")
.setDescription(`<@${target.id}> has been added to this ticket by <@${interaction.user.id}>.`)
.setTimestamp(),
],
});
} catch (err) {
console.error(" ticketuseradd error:", err);
return interaction.reply({
embeds: [errorEmbed("Failed to add user to the ticket.")],
flags: MessageFlags.Ephemeral,
});
}
}
// ==========================================================
// TICKET USER REMOVE: /ticketuserremove
// ==========================================================
if (commandName === "ticketuserremove") {
const target = interaction.options.getUser("user");
const channel = interaction.channel;
const ticketPrefixes = ["support-","giveaway-","spawner-","partnership-","member-report-","staff-report-","building-","mysterybox-"];
const isTicket = ticketPrefixes.some(p => channel.name.startsWith(p));
if (!isTicket) {
return interaction.reply({
embeds: [errorEmbed("This command can only be used inside a ticket channel.")],
flags: MessageFlags.Ephemeral,
});
}
try {
await channel.permissionOverwrites.edit(target.id, {

ViewChannel: false,
SendMessages: false,
});
return interaction.reply({
embeds: [
new EmbedBuilder()
.setColor(0xe74c3c)
.setTitle("User Removed from Ticket")
.setDescription(`<@${target.id}> has been removed from this ticket by <@${interaction.user.id}>.`)
.setTimestamp(),
],
});
} catch (err) {
console.error(" ticketuserremove error:", err);
return interaction.reply({
embeds: [errorEmbed("Failed to remove user from the ticket.")],
flags: MessageFlags.Ephemeral,
});
}
}
// ==========================================================
// PRICING: /pricing
// ==========================================================
if (commandName === "pricing") {
if (!pricingMessage) {
return interaction.reply({
embeds: [errorEmbed("No pricing has been set yet. Ask the founder to use `/pricingset`.")],
flags: MessageFlags.Ephemeral,
});
}
return interaction.reply({
embeds: [
new EmbedBuilder()
.setColor(0x1e40af)
.setTitle("FlamingGMR Pricing")
.setDescription(pricingMessage)
.setTimestamp(),
],
});
}
// ==========================================================
// PRICING SET: /pricingset
// ==========================================================
if (commandName === "pricingset") {
const founderId = process.env.FOUNDER_ID;

if (founderId && interaction.user.id !== founderId) {
return interaction.reply({
embeds: [errorEmbed("Only the server founder can use this command.")],
flags: MessageFlags.Ephemeral,
});
}
const modal = new ModalBuilder()
.setCustomId("pricingset_modal")
.setTitle("Set Pricing Message");
modal.addComponents(
new ActionRowBuilder().addComponents(
new TextInputBuilder()
.setCustomId("pricing_text")
.setLabel("Pricing Message")
.setStyle(TextInputStyle.Paragraph)
.setPlaceholder("Enter the full pricing message here. Press Enter for new lines.")
.setRequired(true)
.setMaxLength(4000)
),
);
return interaction.showModal(modal);
}
// ==========================================================
// GIVEAWAY: handled in Part 3
// ==========================================================
if (commandName === "giveaway") return handleGiveaway(interaction);
} catch (err) {
console.error(` Error handling command "${commandName}":`, err);
const reply = { embeds: [errorEmbed("Something went wrong. Please try again.")], flags: MessageFlags.Ephemeral };
if (interaction.replied || interaction.deferred) {
return interaction.followUp(reply);
}
return interaction.reply(reply);
}
});
// ============================================================
// index.js — Part 3: Giveaway, Dork Game, Ready, Login
// ============================================================
// ============================================================
// GIVEAWAY HANDLER
// ============================================================

async function handleGiveaway(interaction) {
const sub = interaction.options.getSubcommand();
// ── /giveaway normal — regular giveaway, just picks a winner ──
if (sub === "normal") {
const prize = interaction.options.getString("prize");
const durStr = interaction.options.getString("duration");
const description = interaction.options.getString("description") ?? null;
const durationMs = parseDuration(durStr);
if (isNaN(durationMs) || durationMs <= 0) {
return interaction.reply({
embeds: [errorEmbed("Invalid duration. Use formats like `30m`, `1h`, `2d`.")],
flags: MessageFlags.Ephemeral,
});
}
const endsAt = Date.now() + durationMs;
const giveawayData = {
prize,
description,
maxPrize: null,
isDork: false,
endsAt,
hostId: interaction.user.id,
channelId: interaction.channelId,
entries: [],
};
const joinBtn = new ButtonBuilder()
.setCustomId("giveaway_join")
.setLabel("Enter Giveaway")
.setStyle(ButtonStyle.Primary);
const row = new ActionRowBuilder().addComponents(joinBtn);
await interaction.reply({ content: " Giveaway created!", flags: MessageFlags.Ephemeral });
const msg = await interaction.channel.send({
embeds: [buildGiveawayEmbed(giveawayData)],
components: [row],
});
giveawayData.messageId = msg.id;
activeGiveaways.set(msg.id, giveawayData);
// Track host count per guild

const normalKey = `${interaction.guildId}:${interaction.user.id}`;
giveawayHostCounts.set(normalKey, (giveawayHostCounts.get(normalKey) ?? 0) + 1);
setTimeout(() => endGiveaway(msg.id, interaction.channel), durationMs);
}
// ── /giveaway dork — giveaway with dork doubling game ─────
if (sub === "dork") {
const prize = interaction.options.getString("prize");
const durStr = interaction.options.getString("duration");
const maxPrizeStr = interaction.options.getString("maxprize");
const description = interaction.options.getString("description") ?? null;
const durationMs = parseDuration(durStr);
if (isNaN(durationMs) || durationMs <= 0) {
return interaction.reply({
embeds: [errorEmbed("Invalid duration. Use formats like `30m`, `1h`, `2d`.")],
flags: MessageFlags.Ephemeral,
});
}
const maxPrize = parseNumber(maxPrizeStr);
if (isNaN(maxPrize) || maxPrize <= 0) {
return interaction.reply({
embeds: [errorEmbed("Invalid max prize cap. Use a number like `10m`, `500k`, `1b`.")],
flags: MessageFlags.Ephemeral,
});
}
const endsAt = Date.now() + durationMs;
const giveawayData = {
prize,
description,
maxPrize,
isDork: true,
endsAt,
hostId: interaction.user.id,
channelId: interaction.channelId,
entries: [],
};
const joinBtn = new ButtonBuilder()
.setCustomId("giveaway_join")
.setLabel("Enter Giveaway")
.setStyle(ButtonStyle.Primary);
const row = new ActionRowBuilder().addComponents(joinBtn);

await interaction.reply({ content: " Dork giveaway created!", flags: MessageFlags.Ephemeral });
const msg = await interaction.channel.send({
embeds: [buildGiveawayEmbed(giveawayData)],
components: [row],
});
giveawayData.messageId = msg.id;
activeGiveaways.set(msg.id, giveawayData);
// Track host count per guild
const dorkKey = `${interaction.guildId}:${interaction.user.id}`;
giveawayHostCounts.set(dorkKey, (giveawayHostCounts.get(dorkKey) ?? 0) + 1);
setTimeout(() => endGiveaway(msg.id, interaction.channel), durationMs);
}
// ── /giveaway end ──────────────────────────────────────────
if (sub === "end") {
const messageId = interaction.options.getString("messageid").trim();
if (!activeGiveaways.has(messageId)) {
return interaction.reply({
embeds: [errorEmbed("No active giveaway found with that message ID.")],
flags: MessageFlags.Ephemeral,
});
}
await interaction.reply({ content: " Ending giveaway...", flags: MessageFlags.Ephemeral });
await endGiveaway(messageId, interaction.channel);
}
// ── /giveaway track ────────────────────────────────────────
if (sub === "track") {
const target = interaction.options.getUser("user") ?? interaction.user;
const key = `${interaction.guildId}:${target.id}`;
const count = giveawayHostCounts.get(key) ?? 0;
return interaction.reply({
embeds: [
new EmbedBuilder()
.setColor(0x1e40af)
.setTitle("Giveaway Track")
.setDescription(`<@${target.id}> has hosted **${count}** giveaway${count === 1 ? "" : "s"} in this server.`)
.setTimestamp(),
],
});
}

// ── /giveaway leaderboard ──────────────────────────────────
if (sub === "leaderboard") {
const guildPrefix = `${interaction.guildId}:`;
// Filter to entries belonging to this guild only
const guildEntries = [...giveawayHostCounts.entries()]
.filter(([key]) => key.startsWith(guildPrefix))
.map(([key, count]) => [key.replace(guildPrefix, ""), count]); // strip prefix to get userId
if (guildEntries.length === 0) {
return interaction.reply({
embeds: [errorEmbed("No giveaways have been hosted in this server yet.")],
flags: MessageFlags.Ephemeral,
});
}
const sorted = guildEntries.sort((a, b) => b[1] - a[1]).slice(0, 10);
const medals = [" ", " ", " "];
const lines = sorted.map(([userId, count], i) =>
`${medals[i] ?? `**${i + 1}.**`} <@${userId}> — **${count}** giveaway${count === 1 ? "" : "s"}`
);
return interaction.reply({
embeds: [
new EmbedBuilder()
.setColor(0x1e40af)
.setTitle("Giveaway Leaderboard")
.setDescription(lines.join("\n"))
.setTimestamp(),
],
});
}
}
// ============================================================
// END GIVEAWAY LOGIC (used by both auto-timer and /giveaway end)
// ============================================================
async function endGiveaway(messageId, channel) {
const data = activeGiveaways.get(messageId);
if (!data) return; // already ended or never existed
// Remove from active map immediately to prevent double-ending
activeGiveaways.delete(messageId);
// Fetch the original giveaway message

let giveawayMsg;
try {
giveawayMsg = await channel.messages.fetch(messageId);
} catch {
console.error(` Could not fetch giveaway message ${messageId}`);
return;
}
// Disable the join button on the original message
const disabledBtn = new ButtonBuilder()
.setCustomId("giveaway_join")
.setLabel(" Giveaway Ended")
.setStyle(ButtonStyle.Secondary)
.setDisabled(true);
const disabledRow = new ActionRowBuilder().addComponents(disabledBtn);
// Build ended embed
const endedEmbed = new EmbedBuilder()
.setColor(0x95a5a6)
.setTitle(" GIVEAWAY ENDED ")
.setDescription(
`**${data.prize}**` +
(data.description ? `\n${data.description}` : "") +
`\n\n Host: <@${data.hostId}>` +
`\n Total Entries: **${data.entries.length}**`
)
.setTimestamp();
await giveawayMsg.edit({ embeds: [endedEmbed], components: [disabledRow] });
// No entries — end with no winner
if (data.entries.length === 0) {
return channel.send({
embeds: [
new EmbedBuilder()
.setColor(0x95a5a6)
.setTitle(" Giveaway Ended")
.setDescription(`No one entered the giveaway for **${data.prize}**. No winner selected.`)
.setTimestamp(),
],
});
}
// Pick a random winner
const winnerId = data.entries[Math.floor(Math.random() * data.entries.length)];

// Normal giveaway (no dork) — announce winner directly
if (data.maxPrize === null) {
return channel.send({
content: `<@${winnerId}>`,
embeds: [
new EmbedBuilder()
.setColor(0x2ecc71)
.setTitle("Giveaway Winner!")
.setDescription(
`Congratulations <@${winnerId}>! You won **${data.prize}**!
` +
`Please contact <@${data.hostId}> to claim your prize.`
)
.setTimestamp(),
],
});
}
// Dork giveaway — start the doubling game
await startDorkGame(channel, winnerId, data.prize, data.maxPrize);
}
// ============================================================
// DORK GAME — START
// ============================================================
async function startDorkGame(channel, winnerId, prize, maxPrize) {
const dorkId = `${winnerId}_${Date.now()}`;
const doubled = typeof prize === "number" ? prize * 2 : null;
// Detect if prize is a numeric value or a text prize
// For the dork game, prize starts as text on first round,
// then becomes a number when doubling begins
const isNumeric = typeof prize === "number";
const displayPrize = isNumeric ? formatNumber(prize) : prize;
const dorkData = {
winnerId,
prize, // current prize (string on first round, number after first double)
maxPrize,
channelId: channel.id,
};
const dorkEmbed = new EmbedBuilder()
.setColor(0xf1c40f)
.setTitle(" Dork Game")

.setDescription(
`<@${winnerId}> won the giveaway!\n\n` +
` **Prize: ${displayPrize}**\n\n` +
`Do you want to **keep** your prize, or **double** it?\n` +
(isNumeric && doubled > maxPrize
? ` Doubling would exceed the max cap of **${formatNumber(maxPrize)}**. You can only keep.`
: `> If you double and win, you get **${isNumeric ? formatNumber(doubled) : "double the prize"}**!`)
)
.setFooter({ text: `Max prize cap: ${formatNumber(maxPrize)}` })
.setTimestamp();
const row = buildDorkRow(isNumeric ? prize : 0, maxPrize, dorkId, !isNumeric);
const dorkMsg = await channel.send({
content: `<@${winnerId}>`,
embeds: [dorkEmbed],
components: [row],
});
dorkData.messageId = dorkMsg.id;
activeDorks.set(dorkMsg.id, dorkData);
}
// ============================================================
// BUTTON HANDLER (giveaway join + dork keep/double)
// ============================================================
async function handleButton(interaction) {
const { customId } = interaction;
// ── Giveaway Join Button ───────────────────────────────────
if (customId === "giveaway_join") {
// Find which giveaway this button belongs to by message ID
const messageId = interaction.message.id;
const data = activeGiveaways.get(messageId);
if (!data) {
return interaction.reply({
embeds: [errorEmbed("This giveaway has already ended.")],
flags: MessageFlags.Ephemeral,
});
}
if (data.entries.includes(interaction.user.id)) {
return interaction.reply({
embeds: [errorEmbed("You have already entered this giveaway!")],
flags: MessageFlags.Ephemeral,

});
}
// Add entry
data.entries.push(interaction.user.id);
activeGiveaways.set(messageId, data);
// Update the giveaway embed to reflect new entry count
await interaction.message.edit({ embeds: [buildGiveawayEmbed(data)] });
return interaction.reply({
embeds: [
new EmbedBuilder()
.setColor(0x2ecc71)
.setTitle(" Entered!")
.setDescription(`You've entered the giveaway for **${data.prize}**! Good luck!`)
.setTimestamp(),
],
flags: MessageFlags.Ephemeral,
});
}
// ── Dork Keep Button ──────────────────────────────────────
if (customId.startsWith("dork_keep_")) {
const dorkId = customId.replace("dork_keep_", "");
const messageId = interaction.message.id;
const data = activeDorks.get(messageId);
if (!data) {
return interaction.reply({
embeds: [errorEmbed("This dork session has already ended.")],
flags: MessageFlags.Ephemeral,
});
}
// Only the winner can interact
if (interaction.user.id !== data.winnerId) {
return interaction.reply({
embeds: [errorEmbed("Only the giveaway winner can make this choice.")],
flags: MessageFlags.Ephemeral,
});
}
// Remove from active dorks
activeDorks.delete(messageId);
// Disable all buttons on the dork message

const disabledKeep = new ButtonBuilder()
.setCustomId(`dork_keep_${dorkId}`)
.setLabel(" Keep")
.setStyle(ButtonStyle.Success)
.setDisabled(true);
const disabledDouble = new ButtonBuilder()
.setCustomId(`dork_double_${dorkId}`)
.setLabel(" Double")
.setStyle(ButtonStyle.Danger)
.setDisabled(true);
const disabledRow = new ActionRowBuilder().addComponents(disabledKeep, disabledDouble);
await interaction.message.edit({ components: [disabledRow] });
const displayPrize = typeof data.prize === "number"
? formatNumber(data.prize)
: data.prize;
// Send keep result
return interaction.reply({
embeds: [
new EmbedBuilder()
.setColor(0x2ecc71)
.setTitle(" Winner Chose Keep!")
.setDescription(`<@${data.winnerId}> chose keep and won **${displayPrize}**! Congratulations! `)
.setTimestamp(),
],
});
}
// ── Application Panel Buttons ────────────────────────────
if (customId === "app_staff") return startApplicationFlow(interaction, "staff");
if (customId === "app_pm") return startApplicationFlow(interaction, "pm");
// ── Application Accept Button ─────────────────────────────
if (customId.startsWith("accept_app_")) {
const parts = customId.replace("accept_app_", "").split("_");
const appType = parts.pop();
const userId = parts.join("_");
return handleAppAccept(interaction, userId, appType);
}
// ── Application Deny Button ───────────────────────────────
if (customId.startsWith("deny_app_")) {
const parts = customId.replace("deny_app_", "").split("_");
const appType = parts.pop();

const userId = parts.join("_");
return handleAppDeny(interaction, userId, appType);
}
// ── Ticket Buttons ───────────────────────────────────────
const ticketTypes = ["support","giveaway","spawner","partnership","report_member","report_staff","building","mysterybox"];
for (const t of ticketTypes) {
if (customId === `ticket_${t}`) {
return handleTicketCreate(interaction, t);
}
}
// ── Ticket Close Button ───────────────────────────────────
if (customId.startsWith("ticket_close_")) {
const channelId = customId.replace("ticket_close_", "");
return handleTicketClose(interaction, channelId);
}
// ── Dork Double Button ────────────────────────────────────
if (customId.startsWith("dork_double_")) {
const dorkId = customId.replace("dork_double_", "");
const messageId = interaction.message.id;
const data = activeDorks.get(messageId);
if (!data) {
return interaction.reply({
embeds: [errorEmbed("This dork session has already ended.")],
flags: MessageFlags.Ephemeral,
});
}
// Only the winner can interact
if (interaction.user.id !== data.winnerId) {
return interaction.reply({
embeds: [errorEmbed("Only the giveaway winner can make this choice.")],
flags: MessageFlags.Ephemeral,
});
}
// Calculate new prize
// On first double, if prize is still a string, we treat maxPrize as the base to double
// This handles text prizes — we switch to numeric doubling from maxPrize context
let currentNumeric;
if (typeof data.prize === "number") {
currentNumeric = data.prize;
} else {
// First double — we need a numeric base. Use maxPrize / some reasonable factor.

// Since prize is text, we note the doubled prize as "2x [prize]" concept.
// DESIGN DECISION: if the prize is text (not a number), disable double entirely.
// This is caught at buildDorkRow already (prize = 0 for text), so this path
// is a safety fallback.
return interaction.reply({
embeds: [errorEmbed("This prize cannot be doubled as it is not a numeric value.")],
flags: MessageFlags.Ephemeral,
});
}
const newPrize = currentNumeric * 2;
// Safety check — should never hit since button is disabled, but belt-and-suspenders
if (newPrize > data.maxPrize) {
return interaction.reply({
embeds: [errorEmbed(`Doubling would exceed the max cap of **${formatNumber(data.maxPrize)}**. You can only keep.`)],
flags: MessageFlags.Ephemeral,
});
}
// Remove old dork session
activeDorks.delete(messageId);
// Disable buttons on old message
const disabledKeep = new ButtonBuilder()
.setCustomId(`dork_keep_${dorkId}`)
.setLabel(" Keep")
.setStyle(ButtonStyle.Success)
.setDisabled(true);
const disabledDouble = new ButtonBuilder()
.setCustomId(`dork_double_${dorkId}`)
.setLabel(" Double")
.setStyle(ButtonStyle.Danger)
.setDisabled(true);
const disabledRow = new ActionRowBuilder().addComponents(disabledKeep, disabledDouble);
await interaction.message.edit({ components: [disabledRow] });
// Acknowledge the interaction before sending new message
await interaction.reply({
embeds: [
new EmbedBuilder()
.setColor(0xf39c12)
.setTitle(" Doubling!")
.setDescription(`<@${data.winnerId}> chose to double! The prize is now **${formatNumber(newPrize)}**!`)
.setTimestamp(),

],
});
// Start a new dork round with the doubled prize (numeric this time)
await startDorkGame(interaction.channel, data.winnerId, newPrize, data.maxPrize);
}
}

// ============================================================
// index.js — API Part 1: DonutSMP API Helper + Command Routing
// ============================================================
// ── DonutSMP API helper ──────────────────────────────────────
// All API calls go through this function.
// Returns { ok: true, data } on success or { ok: false, message } on failure.
async function donutAPI(path, options = {}) {
const apiKey = process.env.DONUT_API_KEY;
if (!apiKey) return { ok: false, message: "Missing `DONUT_API_KEY` environment variable on Railway." };
const url = `https://api.donutsmp.net${path}`;
const headers = {
"Authorization": `Bearer ${apiKey}`,
"Content-Type": "application/json",
};
try {
const res = await fetch(url, { method: options.method || "GET", headers, body: options.body || undefined });
const json = await res.json();
if (res.status === 401) return { ok: false, message: "Invalid or missing API key. Check your `DONUT_API_KEY` on Railway." };
if (res.status === 500) return { ok: false, message: json.message || "The DonutSMP API could not handle this request. The player or item may not exist." };
if (!res.ok) return { ok: false, message: `API returned status ${res.status}.` };
return { ok: true, data: json };
} catch (err) {
console.error(" DonutSMP API fetch error:", err);
return { ok: false, message: "Could not reach the DonutSMP API. It may be down." };
}
}
// ── Helper: format playtime from seconds to readable string ──
function formatPlaytime(seconds) {
const s = Number(seconds);
if (isNaN(s)) return String(seconds);
const d = Math.floor(s / 86400);
const h = Math.floor((s % 86400) / 3600);

const m = Math.floor((s % 3600) / 60);
const parts = [];
if (d > 0) parts.push(`${d}d`);
if (h > 0) parts.push(`${h}h`);
if (m > 0) parts.push(`${m}m`);
return parts.length ? parts.join(" ") : "< 1m";
}
// ── Helper: format time_left (seconds) to readable string ────
function formatTimeLeft(seconds) {
const s = Number(seconds);
if (isNaN(s) || s <= 0) return "Expired";
const d = Math.floor(s / 86400);
const h = Math.floor((s % 86400) / 3600);
const m = Math.floor((s % 3600) / 60);
if (d > 0) return `${d}d ${h}h`;
if (h > 0) return `${h}h ${m}m`;
return `${m}m`;
}
// ── Helper: format enchantments object to readable string ────
function formatEnchants(enchants) {
if (!enchants || !enchants.enchantments || !enchants.enchantments.levels) return null;
const levels = enchants.enchantments.levels;
const entries = Object.entries(levels);
if (!entries.length) return null;
return entries.map(([name, lvl]) => `${name} ${lvl}`).join(", ");
}
// ============================================================
// TICKET SYSTEM — Part 2 Functions
// ============================================================
// ============================================================
// APPLICATION SYSTEM — Ticket Part 3
// ============================================================
// ── Handler: /applicationpanelsend ───────────────────────────
async function handleApplicationPanelSend(interaction) {
const embed = new EmbedBuilder()
.setColor(0x5865f2)
.setTitle(" Staff Applications")
.setDescription(
"Feel free to apply for staff in **FlamingGMR's server** down below!\n\n" +
" **Requirements:**\n" +
"• You must be **14 years or older** to apply.\n" +
"• There is a **14-day cooldown** between applications.\n" +

"• You must have at least **250 million** on DonutSMP.\n" +
"• Do **not** ask about your application status — doing so will result in an **instant denial**.\n" +
"• Must have **2FA** enabled.\n\n" +
"Select the application type below."
)
.setFooter({ text: "Applications are reviewed by the management team." })
.setTimestamp();
const row = new ActionRowBuilder().addComponents(
new ButtonBuilder()
.setCustomId("app_staff")
.setLabel("Staff Application")
.setStyle(ButtonStyle.Primary),
new ButtonBuilder()
.setCustomId("app_pm")
.setLabel(" PM Application")
.setStyle(ButtonStyle.Success),
);
await interaction.reply({ content: " Application panel sent!", flags: MessageFlags.Ephemeral });
return interaction.channel.send({ embeds: [embed], components: [row] });
}
// ── Start DM application flow ─────────────────────────────────
// Sends first question via DM and stores session in activeApplications
async function startApplicationFlow(interaction, type) {
const user = interaction.user;
const questions = type === "staff" ? STAFF_APP_QUESTIONS : PM_APP_QUESTIONS;
const label = type === "staff" ? "Staff" : "Partner Manager";
// Check if user already has an active application session
if (activeApplications.has(user.id)) {
return interaction.reply({
embeds: [errorEmbed("You already have an active application in progress. Please check your DMs.")],
flags: MessageFlags.Ephemeral,
});
}
// Try to DM the user
let dmChannel;
try {
dmChannel = await user.createDM();
await dmChannel.send({
embeds: [
new EmbedBuilder()
.setColor(0x5865f2)
.setTitle(` ${label} Application`)

.setDescription(
`Welcome! You are applying for **${label}** in FlamingGMR's server.\n\n` +
`Please answer each question by typing your response in this DM.\n` +
`There are **${questions.length} questions** in total.\n\n` +
`**Question 1 of ${questions.length}:**\n${questions[0]}`
)
.setFooter({ text: "Type your answer below. You have 5 minutes per question." })
.setTimestamp(),
],
});
} catch (err) {
return interaction.reply({
embeds: [errorEmbed(
"I couldn't send you a DM! Please enable Direct Messages from server members.\n\n" +
"**To fix:** Right-click the server → Privacy Settings → Allow direct messages from server members."
)],
flags: MessageFlags.Ephemeral,
});
}
// Store the session
activeApplications.set(user.id, {
type,
questions,
answers: [],
currentQ: 0,
guildId: interaction.guildId,
label,
startedAt: Date.now(),
});
// Confirm to user in server (ephemeral)
return interaction.reply({
embeds: [
new EmbedBuilder()
.setColor(0x2ecc71)
.setTitle(" Application Started")
.setDescription("Check your DMs! Answer each question to complete your application.")
.setTimestamp(),
],
flags: MessageFlags.Ephemeral,
});
}
// ── messageCreate: handle DM application answers ─────────────
client.on("messageCreate", async (message) => {
// Ignore bots and non-DM messages

if (message.author.bot) return;
if (message.channel.type !== ChannelType.DM) return;
const session = activeApplications.get(message.author.id);
if (!session) return; // Not in an active application
// Stale session guard — expire after 30 minutes of inactivity
if (Date.now() - session.startedAt > 30 * 60 * 1000) {
activeApplications.delete(message.author.id);
return message.channel.send({
embeds: [errorEmbed("Your application session has expired (30 minutes). Please start again.")],
});
}
// Save this answer
session.answers.push(message.content.trim());
session.currentQ++;
session.startedAt = Date.now(); // Reset inactivity timer
// If more questions remain, send the next one
if (session.currentQ < session.questions.length) {
const nextQ = session.questions[session.currentQ];
await message.channel.send({
embeds: [
new EmbedBuilder()
.setColor(0x5865f2)
.setTitle(` ${session.label} Application`)
.setDescription(
`**Question ${session.currentQ + 1} of ${session.questions.length}:**\n${nextQ}`
)
.setFooter({ text: "Type your answer below." })
.setTimestamp(),
],
});
activeApplications.set(message.author.id, session);
return;
}
// All questions answered — submit the application
activeApplications.delete(message.author.id);
// Send confirmation to the applicant
await message.channel.send({
embeds: [
new EmbedBuilder()
.setColor(0x2ecc71)
.setTitle(" Application Submitted!")

.setDescription(
`Your **${session.label}** application has been submitted successfully!\n\n` +
`The management team will review it and get back to you. ` +
`Do **not** ask about your application status — doing so will result in an **instant denial**.`
)
.setTimestamp(),
],
});
// Fetch the submission channel
const channelId = session.type === "staff"
? process.env.STAFF_APP_CHANNEL_ID
: process.env.PM_APP_CHANNEL_ID;
if (!channelId) {
console.error(` Missing ${session.type === "staff" ? "STAFF" : "PM"}_APP_CHANNEL_ID env variable`);
return;
}
let submitChannel;
try {
submitChannel = await client.channels.fetch(channelId);
} catch (err) {
console.error(" Could not fetch application submission channel:", err);
return;
}
if (!submitChannel) {
console.error(" Application submission channel not found");
return;
}
// Build the submission embed
const submissionEmbed = new EmbedBuilder()
.setColor(0x5865f2)
.setTitle(` ${message.author.username}'s '${session.label}' Application Submitted`)
.setThumbnail(message.author.displayAvatarURL({ forceStatic: false }) ?? null)
.setTimestamp();
// Add each Q&A as a field
session.questions.forEach((q, i) => {
submissionEmbed.addFields({
name: `${i + 1}. ${q}`,
value: session.answers[i] || "No answer provided",
inline: false,
});
});

submissionEmbed.setFooter({ text: `User ID: ${message.author.id}` });
// Accept / Deny buttons
const actionRow = new ActionRowBuilder().addComponents(
new ButtonBuilder()
.setCustomId(`accept_app_${message.author.id}_${session.type}`)
.setLabel(" Accept")
.setStyle(ButtonStyle.Success),
new ButtonBuilder()
.setCustomId(`deny_app_${message.author.id}_${session.type}`)
.setLabel(" Deny")
.setStyle(ButtonStyle.Danger),
);
await submitChannel.send({
embeds: [submissionEmbed],
components: [actionRow],
});
});
// ── Handler: application accept ──────────────────────────────
async function handleAppAccept(interaction, userId, appType) {
const guild = interaction.guild;
// Fetch the member
const member = await guild.members.fetch(userId).catch(() => null);
if (!member) {
return interaction.reply({
embeds: [errorEmbed("Could not find that user in the server. They may have left.")],
flags: MessageFlags.Ephemeral,
});
}
// Build list of role IDs to assign based on app type
const roleIds = [];
if (appType === "staff") {
if (process.env.STAFF_ROLE_ID) roleIds.push(process.env.STAFF_ROLE_ID);
if (process.env.HELPER_ROLE_ID) roleIds.push(process.env.HELPER_ROLE_ID);
if (process.env.TICKET_STAFF_ROLE_ID) roleIds.push(process.env.TICKET_STAFF_ROLE_ID);
} else {
if (process.env.PM_ROLE_ID) roleIds.push(process.env.PM_ROLE_ID);
if (process.env.STAFF_ROLE_ID) roleIds.push(process.env.STAFF_ROLE_ID);
}
// Assign roles
const assignedRoles = [];

const failedRoles = [];
for (const roleId of roleIds) {
try {
const role = guild.roles.cache.get(roleId);
if (role) {
await member.roles.add(role);
assignedRoles.push(`<@&${roleId}>`);
} else {
failedRoles.push(roleId);
}
} catch (err) {
console.error(` Failed to assign role ${roleId}:`, err);
failedRoles.push(roleId);
}
}
// DM the applicant
try {
await member.user.send({
embeds: [
new EmbedBuilder()
.setColor(0x2ecc71)
.setTitle(" Application Accepted!")
.setDescription(
`Congratulations! Your **${appType === "staff" ? "Staff" : "Partner Manager"}** ` +
`application in **FlamingGMR's server** has been accepted!\n\n` +
`Welcome to the team! `
)
.setTimestamp(),
],
});
} catch {
console.warn(` Could not DM ${member.user.username} about acceptance`);
}
// Disable buttons on the submission message
const disabledRow = new ActionRowBuilder().addComponents(
new ButtonBuilder()
.setCustomId(`accept_app_${userId}_${appType}`)
.setLabel(" Accepted")
.setStyle(ButtonStyle.Success)
.setDisabled(true),
new ButtonBuilder()
.setCustomId(`deny_app_${userId}_${appType}`)
.setLabel(" Deny")
.setStyle(ButtonStyle.Danger)

.setDisabled(true),
);
await interaction.message.edit({ components: [disabledRow] });
const roleText = assignedRoles.length
? `\n**Roles assigned:** ${assignedRoles.join(", ")}`
: "";
const failText = failedRoles.length
? `\n Could not assign roles: ${failedRoles.join(", ")} — check role IDs on Railway.`
: "";
return interaction.reply({
embeds: [
new EmbedBuilder()
.setColor(0x2ecc71)
.setTitle(" Application Accepted")
.setDescription(
`<@${userId}>'s application has been accepted by <@${interaction.user.id}>.` +
roleText + failText
)
.setTimestamp(),
],
});
}
// ── Handler: application deny ─────────────────────────────────
async function handleAppDeny(interaction, userId, appType) {
// Show modal asking for deny reason
const modal = new ModalBuilder()
.setCustomId(`deny_reason_${userId}_${appType}`)
.setTitle("Deny Application");
const reasonInput = new TextInputBuilder()
.setCustomId("deny_reason")
.setLabel("Reason for denial")
.setStyle(TextInputStyle.Paragraph)
.setPlaceholder("Enter the reason for denying this application...")
.setRequired(true)
.setMaxLength(500);
modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
return interaction.showModal(modal);
}
// ── Handler: process deny reason modal ───────────────────────
async function handleDenyReasonModal(interaction, userId, appType) {

const reason = interaction.fields.getTextInputValue("deny_reason");
// Try to DM the applicant
try {
const user = await client.users.fetch(userId);
await user.send({
embeds: [
new EmbedBuilder()
.setColor(0xe74c3c)
.setTitle(" Application Denied")
.setDescription(
`Your **${appType === "staff" ? "Staff" : "Partner Manager"}** application ` +
`in **FlamingGMR's server** has been denied.\n\n` +
`**Reason:** ${reason}\n\n` +
`You may re-apply after **14 days**.`
)
.setTimestamp(),
],
});
} catch {
console.warn(` Could not DM user ${userId} about denial`);
}
// Disable buttons on the submission message
const disabledRow = new ActionRowBuilder().addComponents(
new ButtonBuilder()
.setCustomId(`accept_app_${userId}_${appType}`)
.setLabel(" Accept")
.setStyle(ButtonStyle.Success)
.setDisabled(true),
new ButtonBuilder()
.setCustomId(`deny_app_${userId}_${appType}`)
.setLabel(" Denied")
.setStyle(ButtonStyle.Danger)
.setDisabled(true),
);
await interaction.message.edit({ components: [disabledRow] });
return interaction.reply({
embeds: [
new EmbedBuilder()
.setColor(0xe74c3c)
.setTitle(" Application Denied")
.setDescription(
`<@${userId}>'s application has been denied by <@${interaction.user.id}>.\n\n` +
`**Reason:** ${reason}`

)
.setTimestamp(),
],
});
}

// ============================================================
// TICKET SYSTEM — Part 2
// ============================================================
// ── Helper: find or create a category by name ────────────────
async function findOrCreateCategory(guild, categoryName) {
// Look for existing category with exact name match
const existing = guild.channels.cache.find(
c => c.type === ChannelType.GuildCategory && c.name === categoryName
);
if (existing) return existing;
// Create it if it doesn't exist
return guild.channels.create({
name: categoryName,
type: ChannelType.GuildCategory,
});
}
// ── Helper: build ticket welcome embed ───────────────────────
function buildTicketWelcomeEmbed(type, user) {
const descriptions = {
support: "Our staff team will be with you shortly. Please describe your issue in detail.",
giveaway: "Please provide your giveaway claim details below. Staff will assist you shortly.",
partnership: "Thanks for your interest in partnering! Please share your server details below.",
spawner: "Please let us know what spawner transaction you need help with.",
report: "Please describe the situation in detail including any evidence you have.",
building: "Please describe what you need built and any details about the project.",
mysterybox: "Please describe your mystery box issue. Staff will assist you shortly.",
};
return new EmbedBuilder()
.setColor(0x5865f2)
.setTitle(` Ticket Opened`)
.setDescription(
`Welcome to **FlamingGMR's server**, <@${user.id}>!\n\n` +
(descriptions[type] ?? "A staff member will be with you shortly.") +
`\n\nTo close this ticket, click the ** Close Ticket** button below.`
)

.setFooter({ text: `Ticket type: ${type} • Created by ${user.username}` })
.setTimestamp();
}
// ── Handler: /ticketpanelsend ────────────────────────────────
async function handleTicketPanelSend(interaction) {
const embed = new EmbedBuilder()
.setColor(0x5865f2)
.setTitle(" FlamingGMR Support")
.setDescription(
"Welcome to **FlamingGMR's server**! What can we help you with?\n\n" +
"Click a button below to open a ticket in the relevant category."
)
.setFooter({ text: "Only open a ticket if you genuinely need help." })
.setTimestamp();
// Row 1: Support, Giveaway, Spawner, Partnership
const row1 = new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId("ticket_support") .setLabel("Support") .setStyle(ButtonStyle.Primary),
new ButtonBuilder().setCustomId("ticket_giveaway") .setLabel(" Giveaway") .setStyle(ButtonStyle.Success),
new ButtonBuilder().setCustomId("ticket_spawner") .setLabel("Spawner Buy/Sell").setStyle(ButtonStyle.Secondary),
new ButtonBuilder().setCustomId("ticket_partnership").setLabel(" Partnership") .setStyle(ButtonStyle.Primary),
);
// Row 2: Member Report, Staff Report, Building, Mystery Box
const row2 = new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId("ticket_report_member").setLabel(" Member Report").setStyle(ButtonStyle.Danger),
new ButtonBuilder().setCustomId("ticket_report_staff") .setLabel("Staff Report") .setStyle(ButtonStyle.Danger),
new ButtonBuilder().setCustomId("ticket_building") .setLabel("Building") .setStyle(ButtonStyle.Secondary),
new ButtonBuilder().setCustomId("ticket_mysterybox") .setLabel(" Mystery Box") .setStyle(ButtonStyle.Success),
);
await interaction.reply({ content: " Ticket panel sent!", flags: MessageFlags.Ephemeral });
return interaction.channel.send({ embeds: [embed], components: [row1, row2] });
}
// ── Handler: create ticket channel ───────────────────────────
async function handleTicketCreate(interaction, type) {
const guild = interaction.guild;
const user = interaction.user;
// Map button type to category name and channel prefix
const typeMap = {
support: { category: TICKET_CATEGORIES.support, prefix: "support" },
giveaway: { category: TICKET_CATEGORIES.giveaway, prefix: "giveaway" },
spawner: { category: TICKET_CATEGORIES.spawner, prefix: "spawner" },
partnership: { category: TICKET_CATEGORIES.partnership, prefix: "partnership" },

report_member: { category: TICKET_CATEGORIES.report, prefix: "member-report" },
report_staff: { category: TICKET_CATEGORIES.report, prefix: "staff-report" },
building: { category: TICKET_CATEGORIES.building, prefix: "building" },
mysterybox: { category: TICKET_CATEGORIES.mysterybox, prefix: "mysterybox" },
};
const config = typeMap[type];
if (!config) {
return interaction.reply({ embeds: [errorEmbed("Unknown ticket type.")], flags: MessageFlags.Ephemeral });
}
// Check if user already has an open ticket of this type
const existingChannel = guild.channels.cache.find(
c => c.name === `${config.prefix}-${user.username.toLowerCase()}` &&
c.type === ChannelType.GuildText
);
if (existingChannel) {
return interaction.reply({
embeds: [errorEmbed(`You already have an open ticket: <#${existingChannel.id}>`)],
flags: MessageFlags.Ephemeral,
});
}
// Find or create the category
let category;
try {
category = await findOrCreateCategory(guild, config.category);
} catch (err) {
console.error(" Failed to find/create category:", err);
return interaction.reply({
embeds: [errorEmbed("Could not find or create the ticket category. Make sure the bot has Manage Channels permission.")],
flags: MessageFlags.Ephemeral,
});
}
// Get ticket staff role for permissions
const ticketStaffRoleId = process.env.TICKET_STAFF_ROLE_ID;
// Build permission overwrites
const permissionOverwrites = [
{
// @everyone cannot see the channel
id: guild.roles.everyone,
deny: [PermissionsBitField.Flags.ViewChannel],
},
{

// The user who opened the ticket can see and send
id: user.id,
allow: [
PermissionsBitField.Flags.ViewChannel,
PermissionsBitField.Flags.SendMessages,
PermissionsBitField.Flags.ReadMessageHistory,
PermissionsBitField.Flags.AttachFiles,
],
},
{
// The bot itself can always see and manage
id: guild.members.me.id,
allow: [
PermissionsBitField.Flags.ViewChannel,
PermissionsBitField.Flags.SendMessages,
PermissionsBitField.Flags.ManageChannels,
PermissionsBitField.Flags.ReadMessageHistory,
],
},
];
// Add ticket staff role permission if set
if (ticketStaffRoleId) {
permissionOverwrites.push({
id: ticketStaffRoleId,
allow: [
PermissionsBitField.Flags.ViewChannel,
PermissionsBitField.Flags.SendMessages,
PermissionsBitField.Flags.ReadMessageHistory,
PermissionsBitField.Flags.ManageMessages,
],
});
}
// Create the ticket channel
let ticketChannel;
try {
ticketChannel = await guild.channels.create({
name: `${config.prefix}-${user.username.toLowerCase()}`,
type: ChannelType.GuildText,
parent: category.id,
permissionOverwrites,
});
} catch (err) {
console.error(" Failed to create ticket channel:", err);
return interaction.reply({
embeds: [errorEmbed("Could not create the ticket channel. Make sure the bot has Manage Channels permission.")],

flags: MessageFlags.Ephemeral,
});
}
// Build close button
const closeRow = new ActionRowBuilder().addComponents(
new ButtonBuilder()
.setCustomId(`ticket_close_${ticketChannel.id}`)
.setLabel(" Close Ticket")
.setStyle(ButtonStyle.Danger)
);
// Send welcome embed inside the ticket channel
await ticketChannel.send({
content: `<@${user.id}>${ticketStaffRoleId ? ` | <@&${ticketStaffRoleId}>` : ""}`,
embeds: [buildTicketWelcomeEmbed(type, user)],
components: [closeRow],
});
// Confirm to the user
return interaction.reply({
embeds: [
new EmbedBuilder()
.setColor(0x2ecc71)
.setTitle(" Ticket Created")
.setDescription(`Your ticket has been created: <#${ticketChannel.id}>`)
.setTimestamp()
],
flags: MessageFlags.Ephemeral,
});
}
// ── Handler: close ticket modal submission ───────────────────
async function handleTicketClose(interaction, channelId) {
// Show a modal asking for close reason
const modal = new ModalBuilder()
.setCustomId(`ticket_close_reason_${channelId}`)
.setTitle("Close Ticket");
const reasonInput = new TextInputBuilder()
.setCustomId("close_reason")
.setLabel("Reason for closing")
.setStyle(TextInputStyle.Paragraph)
.setPlaceholder("Enter the reason for closing this ticket...")
.setRequired(true)
.setMaxLength(500);

modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
return interaction.showModal(modal);
}
// ── Handler: process ticket close modal ─────────────────────
async function handleTicketCloseModal(interaction, channelId) {
const reason = interaction.fields.getTextInputValue("close_reason");
const channel = interaction.guild.channels.cache.get(channelId);
if (!channel) {
return interaction.reply({
embeds: [errorEmbed("Could not find the ticket channel to close.")],
flags: MessageFlags.Ephemeral,
});
}
// Send closing message in the channel before deleting
await channel.send({
embeds: [
new EmbedBuilder()
.setColor(0xe74c3c)
.setTitle(" Ticket Closed")
.setDescription(
`This ticket has been closed by <@${interaction.user.id}>.\n\n` +
`**Reason:** ${reason}`
)
.setTimestamp()
],
});
await interaction.reply({ content: " Closing ticket...", flags: MessageFlags.Ephemeral });
// Wait 3 seconds so staff can see the closing message, then delete
setTimeout(async () => {
try {
await channel.delete(`Ticket closed by ${interaction.user.username}: ${reason}`);
} catch (err) {
console.error(" Failed to delete ticket channel:", err);
}
}, 3000);
}

// ============================================================
// WELCOME SYSTEM — auto-welcome new members
// ============================================================

client.on("guildMemberAdd", async (member) => {
const welcomeChannelId = process.env.WELCOME_CHANNEL_ID;
if (!welcomeChannelId) {
console.warn(" WELCOME_CHANNEL_ID not set — skipping welcome message");
return;
}
let welcomeChannel;
try {
welcomeChannel = await client.channels.fetch(welcomeChannelId);
} catch (err) {
console.error(" Could not fetch welcome channel:", err);
return;
}
if (!welcomeChannel) return;
// Calculate join position
const memberCount = member.guild.memberCount;
const embed = new EmbedBuilder()
.setColor(0x5865f2)
.setTitle("Welcome to FlamingGMR's Server!")
.setDescription(
`Hey <@${member.id}>, welcome to **${member.guild.name}**!
` +
`You are our **${memberCount}${getOrdinal(memberCount)} member**.
` +
`Make sure to read the rules and enjoy your stay!`
)
.setFooter({ text: `${member.guild.name} • Member #${memberCount}` })
.setTimestamp();
try {
await welcomeChannel.send({ content: `<@${member.id}>`, embeds: [embed] });
} catch (err) {
console.error(" Failed to send welcome message:", err);
}
});
// ── Helper: ordinal suffix (1st, 2nd, 3rd, 4th...) ──────────
function getOrdinal(n) {
const s = ["th", "st", "nd", "rd"];
const v = n % 100;
return s[(v - 20) % 10] || s[v] || s[0];

}
// ============================================================
// CLIENT READY EVENT
// ============================================================
client.once("ready", async () => {
console.log(` Bot logged in as ${client.user.username}`);
console.log(` Serving ${client.guilds.cache.size} guild(s)`);
try {
await registerCommands();
} catch (err) {
console.error(" Command registration failed on ready:", err);
// Do NOT process.exit here — bot can still function with existing commands
}
});
// ============================================================
// UNHANDLED ERRORS — prevent Railway crash on promise rejection
// ============================================================
process.on("unhandledRejection", (err) => {
console.error(" Unhandled promise rejection:", err);
});
process.on("uncaughtException", (err) => {
console.error(" Uncaught exception:", err);
});
// ============================================================
// LOGIN
// ============================================================
if (!process.env.TOKEN) {
console.error(" FATAL: Missing TOKEN environment variable. Bot cannot start.");
process.exit(1);
}
client.login(process.env.TOKEN);