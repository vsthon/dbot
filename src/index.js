// Require the necessary discord.js classes
const { Client, Intents, MessageEmbed, MessageFlags } = require('discord.js');
const { token } = require('./config.json');
const axios = require('axios')
const fs = require('fs/promises')
const { constants } = require('fs')

// Create a new client instance
const client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_MESSAGE_REACTIONS] });

let inUse = false
let reactions = {}
let collector = null

// When the client is ready, run this code (only once)
client.once('ready', async () => {
	console.log('Ready!');
    try {
        await fs.access("./src/data.json", constants.F_OK | constants.R_OK)
        const file = await fs.open("./src/data.json")
        const data = await file.readFile("utf-8")
        const objectdata = JSON.parse(data)
        const guild = await client.guilds.fetch(objectdata.guildId)
        const channel = await guild.channels.fetch(objectdata.channelId)
        const newmsg = await channel.messages.fetch(objectdata.msgId)
        reactions = objectdata.reactions

        const rfilter = (_, user) => !user.bot
        collector = newmsg.createReactionCollector({filter: rfilter, dispose: true}); 

        collector.on('collect', async (reaction, user) => {
            if (reactions[reaction.emoji.name] == undefined) {
                return
            }
            if (reactions[reaction.emoji.name][0] == "None") {
                try {
                    const role2add = await guild.roles.fetch(reactions[reaction.emoji.name][1])
                    const member = await guild.members.fetch(user.id)
                    member.roles.add(role2add)
                    await user.send("Added role")
                    return
                } catch (_) {
                    return
                }
            }
            const data = await axios.get(`https://verify.eryn.io/api/user/${user.id}`)
            if (!data || !data.data || !data.data.userid) return
            if (data.data.error) return
            const userid = data.data.robloxId
            if (reactions[reaction.emoji.name][0] == "Group") {
                const groupdata = await axios.get(`https://groups.roblox.com/v2/users/${userid}/groups/roles`)
                if (!groupdata.data.errors && groupdata.data.data && groupdata.data.data.find(v => 
                    v.group.id >= reactions[reaction.emoji.name][2] && v.role.rank == reactions[reaction.emoji.name][3])
                ) {
                    try {
                        const role2add = await guild.roles.fetch(reactions[reaction.emoji.name][1])
                        const member = await guild.members.fetch(user.id)
                        member.roles.add(role2add)
                        await user.send("Added role")
                    } catch (e) {
                        console.log(e)
                        return
                    }
                }
            } else if (reactions[reaction.emoji.name][0] == "Gamepass") {
                const gamepassdata = await axios.get(`https://inventory.roblox.com/v1/users/${userid}/items/GamePass/${reactions[reaction.emoji.name][2]}`)
                if (!gamepassdata.data.errors && gamepassdata.data.data && gamepassdata.data.data.length > 0) {
                    try {
                        const role2add = await guild.roles.fetch(reactions[reaction.emoji.name][1])
                        const member = await guild.members.fetch(user.id)
                        member.roles.add(role2add)
                        await user.send("Added role")
                    } catch (_) {
                        return
                    }
                }
            }
        });
        collector.on('remove', async (reaction, user) => {
            if (reactions[reaction.emoji.name] == undefined) {
                return
            }
            try {
                const role2remove = await guild.roles.fetch(reactions[reaction.emoji.name][1])
                const member = await guild.members.fetch(user.id)
                member.roles.remove(role2remove)
                await user.send("Removed role")
            } catch (e) {
                console.log(e)
                return
            }
        })
        collector.on('end', collected => { 
            console.log(`Collected ${collected.size} items`); 
        });
        file.close()
    } catch (error) {
        console.log(error)
        return
    }
});

client.on('messageCreate', async msg => {
    if (msg.content === "!reactionbindthing" && !inUse && msg.author.id == msg.guild.ownerId) {
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
            inUse = false 
            msgs = [] 
            const m2 = await channel.send({embeds: [createEmbed(t)]}) 
            setTimeout(() => {
                m2.delete()
            }, 3000);
        } 

        await sendMsg("Enter message ID to react to:", `To stop, say "Exit".`) 

        try { 
            let c = await msg.channel.awaitMessages({filter, max: 1, time: 5000000, errors: ['time']}) 
            if (c.first().content == "Exit") { 
                cleanup("Aborted") 
                return 
            }

            const msgId = c.first().content
            reactions = {}
            while (true) { 
                await sendMsg(`Enter emoji ID for reaction #${Object.keys(reactions).length}.`, `To stop, say "Exit". To finish, say "Finish".`) 
                c = await msg.channel.awaitMessages({filter, max: 1, time: 5000000, errors: ['time']}) 
                let resp = c.first().content 

                if (resp == "Exit") { 
                    cleanup("Aborted") 
                    return 
                } else if (resp == "Finish") { 
                    break 
                }

                await sendMsg(`Should this reaction check for gamepasses, group roles or neither? Enter "Gamepasses" for gamepasses, "Groups" for groups, and "None" for none`, `To stop, say "Exit".`) 
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
                    reactions[resp] = ["Group", String(c.first().content), id, Number(rr)] 
                } else if (c.first().content == "None") {                    
                    await sendMsg(`Enter role ID for reaction #${Object.keys(reactions).length}.`, `To stop, say "Exit".`) 
                    c = await msg.channel.awaitMessages({filter, max: 1, time: 5000000, errors: ['time']}) 

                    if (c.first().content == "Exit") { 
                        cleanup("Aborted") 
                        return 
                    } 
                    reactions[resp] = ["None", String(c.first().content)]
                } else if (c.first().content == "Exit") {
                    cleanup("Aborted") 
                    return 
                } else {
                    cleanup("Invalid response") 
                    return 
                }
            } 
            await cleanup("Success") 
            const newmsg = await msg.channel.messages.fetch(msgId)

            const rfilter = (_, user) => !user.bot
            collector = newmsg.createReactionCollector({filter: rfilter, dispose: true}); 

            collector.on('collect', async (reaction, user) => {
                if (reactions[reaction.emoji.name] == undefined) {
                    return
                }
                if (reactions[reaction.emoji.name][0] == "None") {
                    try {
                        const role2add = await msg.guild.roles.fetch(reactions[reaction.emoji.name][1])
                        const member = await msg.guild.members.fetch(user.id)
                        member.roles.add(role2add)
                        await user.send("Added role")
                        return
                    } catch (_) {
                        return
                    }
                }
                const data = await axios.get(`https://verify.eryn.io/api/user/${user.id}`)
                if (!data) return
                const userid = data.data.robloxId
                if (reactions[reaction.emoji.name][0] == "Group") {
                    const groupdata = await axios.get(`https://groups.roblox.com/v2/users/${userid}/groups/roles`)
                    if (groupdata.data.data && groupdata.data.data.find(v => 
                        v.group.id >= reactions[reaction.emoji.name][2] && v.role.rank == reactions[reaction.emoji.name][3])
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
            collector.on('remove', async (reaction, user) => {
                if (reactions[reaction.emoji.name] == undefined) {
                    return
                }
                try {
                    const role2remove = await msg.guild.roles.fetch(reactions[reaction.emoji.name][1])
                    const member = await msg.guild.members.fetch(user.id)
                    member.roles.remove(role2remove)
                    await user.send("Removed role")
                } catch (e) {
                    console.log(e)
                    return
                }
            })
            collector.on('end', collected => { 
                console.log(`Collected ${collected.size} items`); 
            }); 
            await Object.keys(reactions).forEach(async k => { 
                const remoji = await msg.guild.emojis.cache.find(emoji => emoji.name == k)
                if (remoji) {
                    await newmsg.react(remoji) 
                } else {
                    await newmsg.react(k)
                }
            })
            await fs.writeFile("./src/data.json", JSON.stringify({
                guildId: msg.guild.id,
                channelId: msg.channel.id,
                msgId: msgId,
                reactions: reactions
            }))
        } 
        catch (e) { 
            console.log(e)
            cleanup("Exceeded time limit") 
        }
    }
})

// Login to Discord with your client's token
client.login(token);