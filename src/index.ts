import Discord, {Client, Message, Channel, User, TextChannel, MessageReaction, PartialUser} from 'discord.js'
import { Village, Job } from './village'

const client = new Client()
const token = process.env.DISCORD_TOKEN

client.on('ready', () => {
  console.log('ready...')
})

const jobMap: {[x: string]: Job} = {
  '村': Job.Villagger,
  '占': Job.Seer,
  '盗': Job.Thief,
  '狼': Job.Warewolf,
  '吊': Job.Hangman,
  '狂': Job.Madman
}

client.on('message', async message => {
  if(message.author.bot){
    return
  } else {
    if(/^\\onw/.test(message.content)  && message.channel instanceof TextChannel){
      const jobs = message.content.match(/^\\onw ([村占盗狼吊狂]+)/)?.[1].split('').map(str => jobMap[str])
      if(!jobs || jobs.length < 3) {
        await message.channel.send(`Help

\\onw {役職リスト}
※役職数の合計は、プレイヤー数+2のしてください。

例)4プレイヤー
\\onw 村村占盗狼狼

・役職リスト
村：村人
占：占い師
盗：怪盗
狼：人狼
狂：狂人
吊：吊り人`)
        return
      }
      message.channel.send(`プレイヤーは${jobs.length -2}人です。`)
      const players = await waitForEntry(message.channel, jobs.length -2)

      const village = new Village({
        channel: message.channel,
        client,
        jobs,
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
    const entryMessage = await channel.send('プレイヤーの参加を待っています。\n:raised_hand:をクリックしてください。')
    const botUser = entryMessage.author
    const client = channel.client
    const listener = async (reaction: MessageReaction) => {
      if(reaction.message.id === entryMessage.id && reaction.emoji.name === '✋'){
        const users = reaction.message.reactions.cache
          .find(reaction => reaction.emoji.name === '✋')?.users.cache
          .filter(user => user.id !== botUser.id)
          .map(user => user)
        if(users && users.length >= limit){
          await entryMessage.edit('募集を終了しました。')
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
