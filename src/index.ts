import Discord, {Client, Message, Channel, User, TextChannel, MessageReaction} from 'discord.js'

enum Job {
  Villagger = 'Villagger',
  Thief = 'Thief',
  Seel = 'Seel',
  Warewolf = 'Warewolf'
}

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
      const players = await waitForEntry(message.channel)
      // const jobs = [Job.Villagger, Job.Villagger, Job.Thief, Job.Seel, Job.Warewolf, Job.Warewolf]
      const jobs = [Job.Seel, Job.Seel]
      const assignedJobs = randomJobAssign(players, jobs)
      await Promise.all(players.map(async player => {
        const job = assignedJobs.get(player)
        switch(job){
          case Job.Seel:
            waitForSeelAction(player, assignedJobs)
        }
      }))
    }
  }
})

function randomJobAssign(players: User[], jobs: Job[]): Map<User, Job> {
  const jobSource = [...jobs]
  const res = new Map<User, Job>()
  players.forEach(player => res.set(player, jobSource.splice(Math.floor(Math.random() * jobSource.length))[0]))
  return res
}

function randomPick<T>(arr: T[], num): T[] {
  const src = [...arr]
  const res = []
  while(res.length <= num){
    res.push(src.splice(Math.floor(Math.random() * src.length)))
  }
  return res
}

function waitForSeelAction(player: User, assignedJobs: Map<User, Job>){
  return new Promise(async (resolve) => {
    const askMessage = await player.send(`Your job is "Seel".\nWho devine for?\n${Array.from(assignedJobs.entries()).map(([player, job], i) => {
      return `${emojis[i]}: ${player.username}`
    }).join('\n')}`)
    const listener = async (reaction: MessageReaction, user: User) => {
      if(reaction.message.id === askMessage.id && emojis.includes(reaction.emoji.name) && user.id !== askMessage.author.id){
        const index = emojis.indexOf(reaction.emoji.name)
        const [divinedPlayer, divinedJob] = Array.from(assignedJobs.entries())[index]
        await player.send(`Divined user '${divinedPlayer.username}' is '${divinedJob}'`)
        resolve()
        client.off('messageReactionAdd', listener)
        client.off('messageReactionRemove', listener)
      }
    }
    client.on('messageReactionAdd', listener)
    client.on('messageReactionRemove', listener)

    for(let emoji of emojis.slice(0, assignedJobs.size)){
      await askMessage.react(emoji)
    }
  })
}

const emojis = ['🍎', '🌽', '🍕', '🍙', '🍣', '🍡', '🎂', '🍭', '☕']

function waitForEntry(channel: TextChannel): Promise<User[]> {
  return new Promise(async (resolve) => {
    const entryMessage = await channel.send('Waiting for entry.\nPlease react :raised_hand: for entry for the village.')
    const botUser = entryMessage.author
    const limit = 2
    const client = channel.client
    const listener = async (reaction: MessageReaction) => {
      if(reaction.message.id === entryMessage.id && reaction.emoji.name === '✋'){
        const users = reaction.message.reactions.cache
          .find(reaction => reaction.emoji.name === '✋').users.cache
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

function wait(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  })
}

client.login(token)
