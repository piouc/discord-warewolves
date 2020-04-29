import Discord, {Client, Message, Channel, User, TextChannel, MessageReaction, PartialUser} from 'discord.js'
import { Village, Job } from './village'

const client = new Client()
const token = process.env.DISCORD_TOKEN

client.on('ready', () => {
  console.log('ready...')
})

client.on('message', async message => {
  if(message.author.bot){
    return
  } else {
    if(message.content === '\\onw' && message.channel instanceof TextChannel){
      const selectPlayerCountMessage = await message.channel.send('ワンナイト人狼を開始します。\n参加する人数のアイコンをクリックしてください。');
      const playerCount = await waitForReact(selectPlayerCountMessage, new Map([
        ['4️⃣', 4],
        ['5️⃣', 5],
        ['6️⃣', 6],
        ['7️⃣', 7],
        ['8️⃣', 8],
        ['9️⃣', 9],
        ['🔟', 10],
      ]))
      message.channel.send(`参加人数は${playerCount}人です`)
      const players = await waitForEntry(message.channel, 2)

      const village = new Village({
        channel: message.channel,
        client,
        jobs: [Job.Villagger, Job.Villagger, Job.Seer, Job.Thief, Job.Warewolf, Job.Warewolf],
        owner: message.author,
        users: players
      })

      await village.start()
    }
  }
})

async function waitForReact<T>(message: Message, emojiMap: Map<string, T>): Promise<T>{
  return new Promise(async resolve => {
    let resolved = false
    const listener = async (reaction: MessageReaction, user: User | PartialUser) => {
      if(reaction.message.id === message.id && emojiMap.has(reaction.emoji.name) && user.id !== client.user?.id){
        resolve(emojiMap.get(reaction.emoji.name))
        resolved = true
        client.off('messageReactionAdd', listener)
        client.off('messageReactionRemove', listener)
      }
    }
    client.on('messageReactionAdd', listener)
    client.on('messageReactionRemove', listener)
    for(let emoji of Array.from(emojiMap.keys())){
      if(resolved) break
      await message.react(emoji)
    }
  })
}

function waitForEntry(channel: TextChannel, limit: number): Promise<User[]> {
  return new Promise(async (resolve) => {
    const entryMessage = await channel.send('参加者を待っています.\n参加者は:raised_hand:をクリックしてください。')
    const botUser = entryMessage.author
    const client = channel.client
    const listener = async (reaction: MessageReaction) => {
      if(reaction.message.id === entryMessage.id && reaction.emoji.name === '✋'){
        const users = reaction.message.reactions.cache
          .find(reaction => reaction.emoji.name === '✋')?.users.cache
          .filter(user => user.id !== botUser.id)
          .map(user => user)
        if(users && users.length >= limit){
          await entryMessage.edit('Entry closed.')
          resolve(users)
          client.off('messageReactionAdd', listener)
          client.off('messageReactionRemove', listener)
        }
      }
    }
    client.on('messageReactionAdd', listener)
    client.on('messageReactionRemove', listener)
    await entryMessage.react('✋')
  })
}

client.login(token)
