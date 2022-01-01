// Require the necessary discord.js classes
const { Client, Intents, MessageEmbed } = require('discord.js');
const { token } = require('./config.json');
const axios = require('axios')

// Create a new client instance
const client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_MESSAGE_REACTIONS] });

let inUse = false
let reactions = {}
let collector = null

// When the client is ready, run this code (only once)
client.once('ready', () => {
	console.log('Ready!');
});

client.on('messageCreate', async msg => {
    if (msg.content === "!reactionbindthing" && !inUse) {
        inUse = true
        if (collector != null) {
            collector.stop()
        }
        const filter = r => r.author.id === msg.author.id
        const channel = msg.channel 
        let msgs = [] 

        const createEmbed = (text, footer, title, color) => 
            new MessageEmbed() 
            .setColor(color || '#FF0000') 
            .setTitle(title || 'Reaction Bind thing') 
            .setDescription(text || '') 
            .setFooter(footer || '') 

        const sendMsg = async (text, footer) => { 
            let m = await channel.send({embeds: [createEmbed(text, footer)]}) 
            msgs.push(m) 
            return m 
        } 

        const cleanup = async (t) => { 
            msgs.forEach(m_ => m_.delete()) 
            await channel.send({embeds: [createEmbed(t)]}) 
            inUse = false 
            msgs = [] 
        } 

        await sendMsg("Enter text:", `To stop, say "Exit".`) 

        try { 
            let c = await msg.channel.awaitMessages({filter, max: 1, time: 5000000, errors: ['time']}) 
            if (c.first().content == "Exit") { 
                cleanup("Aborted") 
                return 
            }

            const text = c.first().content 
            while (true) { 
                await sendMsg(`Enter reaction #${Object.keys(reactions).length}.`, `To stop, say "Exit". To finish, say "Finish".`) 
                c = await msg.channel.awaitMessages({filter, max: 1, time: 5000000, errors: ['time']}) 
                let resp = c.first().content 

                if (resp == "Exit") { 
                    cleanup("Aborted") 
                    return 
                } else if (resp == "Finish") { 
                    break 
                }

                await sendMsg(`Should this reaction check for gamepasses or group roles? Enter "Gamepasses" for gamepasses, or "Groups" for groups`, `To stop, say "Exit".`) 
                c = await msg.channel.awaitMessages({filter, max: 1, time: 5000000, errors: ['time']}) 

                if (c.first().content == "Gamepasses") {
                    await sendMsg(`Enter gamepass ID for reaction #${Object.keys(reactions).length}.`, `To stop, say "Exit".`) 
                    c = await msg.channel.awaitMessages({filter, max: 1, time: 5000000, errors: ['time']}) 
    
                    if (c.first().content == "Exit") { 
                        cleanup("Aborted") 
                        return 
                    } 
                    const gid = c.first().content
                    
                    await sendMsg(`Enter role ID for reaction #${Object.keys(reactions).length}.`, `To stop, say "Exit".`) 
                    c = await msg.channel.awaitMessages({filter, max: 1, time: 5000000, errors: ['time']}) 
    
                    if (c.first().content == "Exit") { 
                        cleanup("Aborted") 
                        return 
                    } 
                    
                    reactions[resp] = ["Gamepass", String(c.first().content), gid] 
                } else if (c.first().content == "Groups") {
                    await sendMsg(`Enter group ID for reaction #${Object.keys(reactions).length}.`, `To stop, say "Exit".`) 
                    c = await msg.channel.awaitMessages({filter, max: 1, time: 5000000, errors: ['time']}) 
    
                    if (c.first().content == "Exit") { 
                        cleanup("Aborted") 
                        return 
                    }
                    let id = c.first().content

                    await sendMsg(`Enter group role rank for reaction #${Object.keys(reactions).length}.`, `To stop, say "Exit".`) 
                    c = await msg.channel.awaitMessages({filter, max: 1, time: 5000000, errors: ['time']}) 
    
                    if (c.first().content == "Exit") { 
                        cleanup("Aborted") 
                        return 
                    } 
                    const rr = c.first().content

                    await sendMsg(`Enter role ID for reaction #${Object.keys(reactions).length}.`, `To stop, say "Exit".`) 
                    c = await msg.channel.awaitMessages({filter, max: 1, time: 5000000, errors: ['time']}) 
    
                    if (c.first().content == "Exit") { 
                        cleanup("Aborted") 
                        return 
                    } 
                    reactions[resp] = ["Group", String(c.first().content), id, rr] 
                } else if (c.first().content == "Exit") {
                    cleanup("Aborted") 
                    return 
                } else {
                    cleanup("Invalid response") 
                    return 
                }
            } 
            await cleanup("Success") 
            const newmsg = await channel.send({embeds: [createEmbed(text, "Reaction stuff", "Test", '#00FFFF')]})

            const rfilter = (_, user) => !user.bot
            collector = newmsg.createReactionCollector({filter: rfilter, dispose: true}); 

            collector.on('collect', async (reaction, user) => {
                if (reactions[reaction.emoji.name] == undefined) {
                    return
                }
                const data = await axios.get(`https://verify.eryn.io/api/user/${user.id}`)
                if (!data) return
                const userid = data.data.robloxId
                if (reactions[reaction.emoji.name][0] == "Group") {
                    const groupdata = await axios.get(`https://groups.roblox.com/v2/users/${userid}/groups/roles`)
                    if (groupdata.data.data && groupdata.data.data.find(v => 
                        v.group.id == reactions[reaction.emoji.name][2] && v.role.rank == reactions[reaction.emoji.name][3])
                    ) {
                        try {
                            const role2add = await msg.guild.roles.fetch(reactions[reaction.emoji.name][1])
                            const member = await msg.guild.members.fetch(user.id)
                            member.roles.add(role2add)
                            await user.send("Added role")
                        } catch (e) {
                            console.log(e)
                            return
                        }
                    }
                } else if (reactions[reaction.emoji.name][0] == "Gamepass") {
                    const gamepassdata = await axios.get(`https://inventory.roblox.com/v1/users/${userid}/items/GamePass/${reactions[reaction.emoji.name][2]}`)
                    if (gamepassdata.data.data && gamepassdata.data.data.length > 0) {
                        try {
                            const role2add = await msg.guild.roles.fetch(reactions[reaction.emoji.name][1])
                            const member = await msg.guild.members.fetch(user.id)
                            member.roles.add(role2add)
                            await user.send("Added role")
                        } catch (_) {
                            return
                        }
                    }
                }
            });
            collector.on('dispose', async (reaction, user) => {
                if (reactions[reaction.emoji.name] == undefined) {
                    return
                }
                if (reactions[reaction.emoji.name][0] == "Group") {
                    try {
                        const role2remove = await msg.guild.roles.fetch(reactions[reaction.emoji.name][1])
                        const member = await msg.guild.members.fetch(user.id)
                        member.roles.remove(role2remove)
                        await user.send("Removed role")
                    } catch (e) {
                        console.log(e)
                        return
                    }
                } else if (reactions[reaction.emoji.name][0] == "Gamepass") {
                    try {
                        const role2remove = await msg.guild.roles.fetch(reactions[reaction.emoji.name][1])
                        const member = await msg.guild.members.fetch(user.id)
                        member.roles.remove(role2remove)
                        await user.send("Removed role")
                    } catch (_) {
                        console.log(e)
                        return
                    }
                }
            })
            collector.on('end', collected => { 
                console.log(`Collected ${collected.size} items`); 
            }); 
            Object.keys(reactions).forEach(async k => { await newmsg.react(k) })
        } 
        catch { 
            cleanup("Exceeded time limit") 
        }
    }
})

// Login to Discord with your client's token
client.login(token);