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
      const selectPlayerCountMessage = await message.channel.send('Please react player count icon.');
      const playerCount = await waitForReact(selectPlayerCountMessage, new Map([
        ['4️⃣', 4],
        ['5️⃣', 5],
        ['6️⃣', 6],
        ['7️⃣', 7],
        ['8️⃣', 8],
        ['9️⃣', 9],
        ['🔟', 10],
      ]))
      const players = await waitForEntry(message.channel)
      // const jobs = [Job.Villagger, Job.Villagger, Job.Thief, Job.Seel, Job.Warewolf, Job.Warewolf]
      const jobs = [Job.Warewolf, Job.Warewolf]
      const [assignedJobs, notAssignedJobs] = randomJobAssign(players, jobs)
      console.log(notAssignedJobs)
      await Promise.all(players.map(async player => {
        const job = assignedJobs.get(player)
        switch(job){
          case Job.Seel:
            waitForSeelAction(player, assignedJobs, notAssignedJobs)
          case Job.Warewolf:
            waitForWarewolfAction(player, assignedJobs)
        }
      }))
    }
  }
})

async function waitForReact<T>(message: Message, emojiMap: Map<string, T>): Promise<T>{
  return new Promise(async resolve => {
    let resolved = false
    const listener = async (reaction: MessageReaction, user: User) => {
      if(reaction.message.id === message.id && emojiMap.has(reaction.emoji.name) && user.id !== client.user.id){
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

async function waitForSelect<T>({
  target,
  emojiMap,
  message,
  valueResolver
}: {
  target: TextChannel | User,
  emojiMap: Map<string, T>,
  message: string,
  valueResolver: (value: T) => string
}): Promise<T>{
  const optionListText = Array.from(emojiMap.entries(), ([emoji, value]) => `${emoji}: ${valueResolver(value)}`).join('\n')
  const askMessage = await target.send(`${message}\n${optionListText}`)
  return await waitForReact(askMessage, emojiMap)
}

function randomJobAssign(players: User[], jobs: Job[]): [Map<User, Job>, Job[]] {
  const jobSource = [...jobs]
  const res = new Map<User, Job>()
  players.forEach(player => res.set(player, jobSource.splice(Math.floor(Math.random() * jobSource.length), 1)[0]))
  return [res, jobSource]
}

function randomPick<T>(arr: T[], num): T[] {
  const src = [...arr]
  const res = []
  while(res.length <= num){
    res.push(src.splice(Math.floor(Math.random() * src.length)))
  }
  return res
}

function waitForWarewolfAction(player: User, assignedJobs: Map<User, Job>): Promise<void>{
  const otherWarewolves = Array.from(assignedJobs.entries()).filter(([p, job]) => p.id !== player.id).map(([player]) => player)
  player.send(`Your job is "Warewolf".\n with ${otherWarewolves.map(p => p.username).join(', ')}`)
}

function waitForSeelAction(player: User, assignedJobs: Map<User, Job>, notAssignedJobs: Job[]): Promise<void>{
  return new Promise(async resolve => {
    const divineablePlayers = Array.from(assignedJobs.keys()).filter(user => user.id !== player.id)
    const divineablePlayerMap = new Map<string, User | null>(divineablePlayers.map((player, i) => [emojis[i], player]))
    divineablePlayerMap.set(emojis[divineablePlayerMap.size], null)

    const divinedPlayer = await waitForSelect({
      target: player,
      emojiMap: divineablePlayerMap,
      message: 'Your job is "Seel".\nWho devine for?',
      valueResolver: player => player ? player.username : 'Not assigned jobs'
    })

    if(divinedPlayer){
      await player.send(`'${divinedPlayer.username}' is ${assignedJobs.get(divinedPlayer)}`)
    } else {
      await player.send(`Not assigned jobs is ${notAssignedJobs.join(', ')}`)
    }
  })
}



const emojis = ['🍎', '🌽', '🍕', '🍙', '🍣', '🍡', '🎂', '🍭', '☕']

function waitForEntry(channel: TextChannel): Promise<User[]> {
  return new Promise(async (resolve) => {
    const entryMessage = await channel.send('Waiting for entry.\nPlease react :raised_hand: for entry for the village.')
    const botUser = entryMessage.author
    const limit = 1
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
