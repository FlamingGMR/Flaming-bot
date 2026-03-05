// ============================================================
// index.js — Part 1: Imports, Setup, Command Definitions
// ============================================================
const {
Client,
GatewayIntentBits,
EmbedBuilder,
ButtonBuilder,
ButtonStyle,
ActionRowBuilder,
PermissionFlagsBits,
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
],
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
.setName("create")
.setDescription("Start a new giveaway")
.addStringOption(o => o.setName("prize").setDescription("Prize name / description").setRequired(true))
.addStringOption(o =>
o.setName("duration")
.setDescription("Duration (e.g. 1h, 30m, 2d)")
.setRequired(true)
)
.addStringOption(o =>
o.setName("maxprize")
.setDescription("Max prize cap for the dork doubling game (e.g. 10m)")
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
.setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents),
].map(cmd => cmd.toJSON());
// ============================================================
// REGISTER SLASH COMMANDS VIA REST
// ============================================================
async function registerCommands() {
const token = process.env.TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID; // optional: set for guild-only (instant) registration
if (!token) throw new Error("Missing environment variable: TOKEN");
if (!clientId) throw new Error("Missing environment variable: CLIENT_ID");
const rest = new REST({ version: "10" }).setToken(token);
console.log(" Registering slash commands...");
try {
if (guildId) {
// Guild commands update instantly — great for testing
await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
console.log(` Slash commands registered to guild ${guildId}`);
} else {
// Global commands take up to 1 hour to propagate
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
return new EmbedBuilder()
.setColor(0xf1c40f)
.setTitle(" GIVEAWAY ")
.setDescription(desc)
.setFooter({ text: `Max prize cap: ${formatNumber(data.maxPrize)}` })
.setTimestamp(data.endsAt);
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
const reply = { embeds: [errorEmbed("Something went wrong with that button.")], ephemeral: true };
if (interaction.replied || interaction.deferred) return interaction.followUp(reply);
return interaction.reply(reply);
}
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
return interaction.reply({ embeds: [errorEmbed("That user is not in this server.")], ephemeral: true });
}
const embed = new EmbedBuilder()
.setColor(0xf39c12)

.setTitle(" Member Warned")
.addFields(
{ name: " User", value: `<@${target.id}> (${target.tag})`, inline: true },
{ name: " Moderator", value: `<@${interaction.user.id}>`, inline: true },
{ name: " Reason", value: reason }
)
.setThumbnail(target.displayAvatarURL())
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
return interaction.reply({ embeds: [errorEmbed("That user is not in this server.")], ephemeral: true });
}
if (!member.bannable) {
return interaction.reply({ embeds: [errorEmbed("I cannot ban that user. They may have a higher role than me.")], ephemeral: true });
}
await member.ban({ reason });
const embed = new EmbedBuilder()
.setColor(0xe74c3c)
.setTitle(" Member Banned")
.addFields(
{ name: " User", value: `<@${target.id}> (${target.tag})`, inline: true },
{ name: " Moderator", value: `<@${interaction.user.id}>`, inline: true },
{ name: " Reason", value: reason }
)
.setThumbnail(target.displayAvatarURL())
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
return interaction.reply({ embeds: [errorEmbed("Could not find a user with that ID.")], ephemeral: true });
}
try {
await interaction.guild.members.unban(userId, reason);
} catch {
return interaction.reply({ embeds: [errorEmbed("That user is not banned or I lack permission.")], ephemeral: true });
}
const embed = new EmbedBuilder()
.setColor(0x2ecc71)
.setTitle(" Member Unbanned")
.addFields(
{ name: " User", value: `${user.tag} (${userId})`, inline: true },
{ name: " Moderator", value: `<@${interaction.user.id}>`, inline: true },
{ name: " Reason", value: reason }
)
.setThumbnail(user.displayAvatarURL())
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
return interaction.reply({ embeds: [errorEmbed("Invalid duration. Use formats like `10m`, `1h`, `7d`.")], ephemeral: true });
}
const maxTimeout = 28 * 24 * 60 * 60 * 1000; // 28 days in ms
if (durationMs > maxTimeout) {
return interaction.reply({ embeds: [errorEmbed("Maximum timeout duration is 28 days.")], ephemeral: true });
}

const member = await interaction.guild.members.fetch(target.id).catch(() => null);
if (!member) {
return interaction.reply({ embeds: [errorEmbed("That user is not in this server.")], ephemeral: true });
}
if (!member.moderatable) {
return interaction.reply({ embeds: [errorEmbed("I cannot timeout that user. They may have a higher role than me.")], ephemeral: true });
}
await member.timeout(durationMs, reason);
const endsAt = Math.floor((Date.now() + durationMs) / 1000);
const embed = new EmbedBuilder()
.setColor(0xe67e22)
.setTitle(" Member Timed Out")
.addFields(
{ name: " User", value: `<@${target.id}> (${target.tag})`, inline: true },
{ name: " Moderator", value: `<@${interaction.user.id}>`, inline: true },
{ name: " Expires", value: `<t:${endsAt}:R>`, inline: true },
{ name: " Reason", value: reason }
)
.setThumbnail(target.displayAvatarURL())
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
return interaction.reply({ embeds: [errorEmbed("That user is not in this server.")], ephemeral: true });
}
if (!member.isCommunicationDisabled()) {
return interaction.reply({ embeds: [errorEmbed("That user is not currently timed out.")], ephemeral: true });
}
await member.timeout(null, reason);
const embed = new EmbedBuilder()
.setColor(0x2ecc71)

.setTitle(" Timeout Removed")
.addFields(
{ name: " User", value: `<@${target.id}> (${target.tag})`, inline: true },
{ name: " Moderator", value: `<@${interaction.user.id}>`, inline: true },
{ name: " Reason", value: reason }
)
.setThumbnail(target.displayAvatarURL())
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
return interaction.reply({ embeds: [errorEmbed("That user is not in this server.")], ephemeral: true });
}
if (member.roles.cache.has(role.id)) {
return interaction.reply({ embeds: [errorEmbed(`<@${target.id}> already has the <@&${role.id}> role.`)], ephemeral: true });
}
if (!role.editable) {
return interaction.reply({ embeds: [errorEmbed("I cannot assign that role. It may be higher than my highest role.")], ephemeral: true });
}
await member.roles.add(role);
const embed = new EmbedBuilder()
.setColor(0x3498db)
.setTitle(" Role Added")
.addFields(
{ name: " User", value: `<@${target.id}> (${target.tag})`, inline: true },
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
return interaction.reply({ embeds: [errorEmbed("That user is not in this server.")], ephemeral: true });
}
if (!member.roles.cache.has(role.id)) {
return interaction.reply({ embeds: [errorEmbed(`<@${target.id}> does not have the <@&${role.id}> role.`)], ephemeral: true });
}
if (!role.editable) {
return interaction.reply({ embeds: [errorEmbed("I cannot remove that role. It may be higher than my highest role.")], ephemeral: true });
}
await member.roles.remove(role);
const embed = new EmbedBuilder()
.setColor(0xe74c3c)
.setTitle(" Role Removed")
.addFields(
{ name: " User", value: `<@${target.id}> (${target.tag})`, inline: true },
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
return interaction.reply({ embeds: [errorEmbed("Invalid hex color. Example: `#ff0000`")], ephemeral: true });
}
color = parsed;

}
const embed = new EmbedBuilder()
.setColor(color)
.setTitle(title)
.setDescription(description)
.setFooter({ text: `Posted by ${interaction.user.tag}` })
.setTimestamp();
// Confirm to the command user (ephemeral), then send the real embed
await interaction.reply({ content: " Embed sent!", ephemeral: true });
return interaction.channel.send({ embeds: [embed] });
}
// ==========================================================
// SMOKER CALCULATOR: /smoker
// ==========================================================
if (commandName === "smoker") {
const amountStr = interaction.options.getString("amount");
const amount = parseNumber(amountStr);
if (isNaN(amount) || amount <= 0) {
return interaction.reply({ embeds: [errorEmbed("Invalid amount. Use a number like `50`, `5k`, `2.5m`.")], ephemeral: true });
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
return interaction.reply({ embeds: [errorEmbed("Invalid amount. Use a number like `10`, `5k`, `2m`.")], ephemeral: true });
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
return interaction.reply({ embeds: [errorEmbed("Invalid price. Use a number like `4.4m`, `5200000`, `5.2m`.")], ephemeral: true });
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
// GIVEAWAY: handled in Part 3
// ==========================================================
if (commandName === "giveaway") return handleGiveaway(interaction);
} catch (err) {
console.error(` Error handling command "${commandName}":`, err);
const reply = { embeds: [errorEmbed("Something went wrong. Please try again.")], ephemeral: true };
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
// ── /giveaway create ───────────────────────────────────────
if (sub === "create") {

const prize = interaction.options.getString("prize");
const durStr = interaction.options.getString("duration");
const maxPrizeStr = interaction.options.getString("maxprize");
const description = interaction.options.getString("description") ?? null;
const durationMs = parseDuration(durStr);
if (isNaN(durationMs) || durationMs <= 0) {
return interaction.reply({
embeds: [errorEmbed("Invalid duration. Use formats like `30m`, `1h`, `2d`.")],
ephemeral: true,
});
}
const maxPrize = parseNumber(maxPrizeStr);
if (isNaN(maxPrize) || maxPrize <= 0) {
return interaction.reply({
embeds: [errorEmbed("Invalid max prize cap. Use a number like `10m`, `500k`, `1b`.")],
ephemeral: true,
});
}
const endsAt = Date.now() + durationMs;
const giveawayData = {
prize,
description,
maxPrize,
endsAt,
hostId: interaction.user.id,
channelId: interaction.channelId,
entries: [],
};
// Build join button
const joinBtn = new ButtonBuilder()
.setCustomId("giveaway_join")
.setLabel(" Enter Giveaway")
.setStyle(ButtonStyle.Primary);
const row = new ActionRowBuilder().addComponents(joinBtn);
// Reply to the slash command ephemerally, send the real giveaway embed to channel
await interaction.reply({ content: " Giveaway created!", ephemeral: true });
const msg = await interaction.channel.send({
embeds: [buildGiveawayEmbed(giveawayData)],
components: [row],

});
// Store with the real message ID now that we have it
giveawayData.messageId = msg.id;
activeGiveaways.set(msg.id, giveawayData);
// Schedule auto-end
setTimeout(() => endGiveaway(msg.id, interaction.channel), durationMs);
}
// ── /giveaway end ──────────────────────────────────────────
if (sub === "end") {
const messageId = interaction.options.getString("messageid").trim();
if (!activeGiveaways.has(messageId)) {
return interaction.reply({
embeds: [errorEmbed("No active giveaway found with that message ID.")],
ephemeral: true,
});
}
await interaction.reply({ content: " Ending giveaway...", ephemeral: true });
await endGiveaway(messageId, interaction.channel);
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
// Start the dork game
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
ephemeral: true,
});
}
if (data.entries.includes(interaction.user.id)) {
return interaction.reply({
embeds: [errorEmbed("You have already entered this giveaway!")],
ephemeral: true,
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
ephemeral: true,
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
ephemeral: true,
});
}
// Only the winner can interact
if (interaction.user.id !== data.winnerId) {
return interaction.reply({
embeds: [errorEmbed("Only the giveaway winner can make this choice.")],
ephemeral: true,
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
// ── Dork Double Button ────────────────────────────────────
if (customId.startsWith("dork_double_")) {
const dorkId = customId.replace("dork_double_", "");
const messageId = interaction.message.id;
const data = activeDorks.get(messageId);
if (!data) {
return interaction.reply({
embeds: [errorEmbed("This dork session has already ended.")],
ephemeral: true,
});
}
// Only the winner can interact
if (interaction.user.id !== data.winnerId) {
return interaction.reply({
embeds: [errorEmbed("Only the giveaway winner can make this choice.")],
ephemeral: true,
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
ephemeral: true,
});
}
const newPrize = currentNumeric * 2;
// Safety check — should never hit since button is disabled, but belt-and-suspenders
if (newPrize > data.maxPrize) {
return interaction.reply({

embeds: [errorEmbed(`Doubling would exceed the max cap of **${formatNumber(data.maxPrize)}**. You can only keep.`)],
ephemeral: true,
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
// CLIENT READY EVENT
// ============================================================
client.once("ready", async () => {
console.log(` Bot logged in as ${client.user.tag}`);
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