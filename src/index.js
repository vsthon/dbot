// Require the necessary discord.js classes
const { Client, Intents, MessageEmbed, MessageAttachment } = require('discord.js');
const axios = require('axios')
const fs = require('fs/promises')
const { constants } = require('fs')
const express = require('express');
const bp = require('body-parser')
const app     = express();
const { ToadScheduler, SimpleIntervalJob, AsyncTask } = require('toad-scheduler')

// register .env stuff
require("dotenv").config()

// Create a new client instance
const client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_MESSAGE_REACTIONS] });

let inUse = false
let reactions = {}
let collector = null
let leaderboarddata = []
let gdId = undefined
let chId = undefined
let fileData = {}

app.set('port', (process.env.PORT || 5000));

app.use(bp.urlencoded({ extended: false }))
app.use(bp.json())

//For avoidong Heroku $PORT error
app.get('/', (req, res) => {
    let result = 'App is running'
    res.send(result);
}).listen(app.get('port'), function() {
    console.log('App is running, server is listening on port ', app.get('port'));
});
app.post('/', async (req, res) => {
    leaderboarddata = req.body
    fileData.leaderboarddata = leaderboarddata
    await fs.writeFile("./src/data.json", JSON.stringify(fileData))
})

const scheduler = new ToadScheduler()

const task = new AsyncTask(
    'leaderboard', 
    async () => { 
        if (gdId && chId) {
            const guild = await client.guilds.fetch(gdId)
            const channel = await guild.channels.fetch(chId)
            const img = new MessageAttachment("./images/img.jfif", "img.jpg")
            await channel.send({files: [img]})
            let n = 1
            let msg = ">>> **MOST WANTED CREWS IN LAS PALMAS**\n"
            for (let n = 1; n <= leaderboarddata.length; n++) {
                const v = leaderboarddata[n - 1]
                if (typeof v == "string") {
                    msg += String(n) + ". " + v + "\n"
                }
            }
            const date = new Date()
            msg += '\nUpdated on ' + String(date.getMonth() + 1) + '/' + String(date.getDate()) + '/' + String(date.getFullYear())
            channel.send(msg)
        }
    },
    (err) => {
        console.log(err)
    }
)
const job = new SimpleIntervalJob({ days: 1 }, task)

scheduler.addSimpleIntervalJob(job)

// When the client is ready, run this code (only once)
client.once('ready', async () => {
	console.log('Ready!');
    let file = undefined
    try {
        await fs.access("./src/data.json", constants.F_OK | constants.R_OK)
        file = await fs.open("./src/data.json")
        const data = await file.readFile("utf-8")
        const objectdata = JSON.parse(data)
        reactions = objectdata.reactions
        fileData = objectdata
        if (objectdata.gdId) {
            gdId = objectdata.gdId
        }
        if (objectdata.chId) {
            chId = objectdata.chId
        }
        if (objectdata.leaderboarddata) {
            leaderboarddata = objectdata.leaderboarddata
        }
        if (!objectdata.guild || !objectdata.channel || !objectdata.newmsg) {
            return
        }
        
        const guild = await client.guilds.fetch(objectdata.guildId)
        const channel = await guild.channels.fetch(objectdata.channelId)
        const newmsg = await channel.messages.fetch(objectdata.msgId)

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
                    v.group.id == reactions[reaction.emoji.name][2] && v.role.rank >= reactions[reaction.emoji.name][3])
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
        if (file) {
            file.close()
        }
        console.log(error)
        return
    }
});

client.on('messageCreate', async msg => {
    if (msg.content === "!bindLeaderboardChannel" && !inUse && msg.author.id == msg.guild.ownerId) {
        inUse = true
        await msg.channel.send("Enter channel ID")
        try {
            const filter = () => true
            let c = await msg.channel.awaitMessages({filter, max: 1, time: 5000000, errors: ['time']}) 
            gdId = String(msg.guild.id)
            chId = c.first().content
            fileData.gdId = gdId
            fileData.chId = chId
            await fs.writeFile("./src/data.json", JSON.stringify(fileData))
        } catch (error) {
            console.log(error)
        }
    }
    else if (msg.content === "!reactionbindthing" && !inUse && msg.author.id == msg.guild.ownerId) {
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
                await cleanup("Aborted") 
                return 
            }

            const msgId = c.first().content
            let freactions = {}
            while (true) { 
                await sendMsg(`Enter emoji ID for reaction #${Object.keys(freactions).length}.`, `To stop, say "Exit". To finish, say "Finish".`) 
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
                    await sendMsg(`Enter gamepass ID for reaction #${Object.keys(freactions).length}.`, `To stop, say "Exit".`) 
                    c = await msg.channel.awaitMessages({filter, max: 1, time: 5000000, errors: ['time']}) 
    
                    if (c.first().content == "Exit") { 
                        cleanup("Aborted") 
                        return 
                    } 
                    const gid = c.first().content
                    
                    await sendMsg(`Enter role ID for reaction #${Object.keys(freactions).length}.`, `To stop, say "Exit".`) 
                    c = await msg.channel.awaitMessages({filter, max: 1, time: 5000000, errors: ['time']}) 
    
                    if (c.first().content == "Exit") { 
                        cleanup("Aborted") 
                        return 
                    } 
                    
                    freactions[resp] = ["Gamepass", String(c.first().content), gid] 
                } else if (c.first().content == "Groups") {
                    await sendMsg(`Enter group ID for reaction #${Object.keys(freactions).length}.`, `To stop, say "Exit".`) 
                    c = await msg.channel.awaitMessages({filter, max: 1, time: 5000000, errors: ['time']}) 
    
                    if (c.first().content == "Exit") { 
                        cleanup("Aborted") 
                        return 
                    }
                    let id = c.first().content

                    await sendMsg(`Enter group role rank for reaction #${Object.keys(freactions).length}.`, `To stop, say "Exit".`) 
                    c = await msg.channel.awaitMessages({filter, max: 1, time: 5000000, errors: ['time']}) 
    
                    if (c.first().content == "Exit") { 
                        cleanup("Aborted") 
                        return 
                    } 
                    const rr = c.first().content

                    await sendMsg(`Enter role ID for reaction #${Object.keys(freactions).length}.`, `To stop, say "Exit".`) 
                    c = await msg.channel.awaitMessages({filter, max: 1, time: 5000000, errors: ['time']}) 
    
                    if (c.first().content == "Exit") { 
                        cleanup("Aborted") 
                        return 
                    } 
                    freactions[resp] = ["Group", String(c.first().content), id, Number(rr)] 
                } else if (c.first().content == "None") {                    
                    await sendMsg(`Enter role ID for reaction #${Object.keys(freactions).length}.`, `To stop, say "Exit".`) 
                    c = await msg.channel.awaitMessages({filter, max: 1, time: 5000000, errors: ['time']}) 

                    if (c.first().content == "Exit") { 
                        cleanup("Aborted") 
                        return 
                    } 
                    freactions[resp] = ["None", String(c.first().content)]
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
            reactions = freactions

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
                        v.group.id == reactions[reaction.emoji.name][2] && v.role.rank >= reactions[reaction.emoji.name][3])
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
            fileData.guildId = msg.guild.id
            fileData.channelId = msg.channel.id
            fileData.msgId = msgId
            fileData.reactions = reactions
            await fs.writeFile("./src/data.json", JSON.stringify(fileData))
        } 
        catch (e) { 
            console.log(e)
            cleanup("Exceeded time limit") 
        }
    }
})

// Login to Discord with your client's token
client.login(process.env.TOKEN);