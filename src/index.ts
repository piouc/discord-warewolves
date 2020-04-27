import Discord, {Client, Message, Channel, User, TextChannel} from 'discord.js'

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
      const everyoneRole = message.guild.roles.everyone
      message.channel.send('Waiting for entry.\nPlease type "\\e" for entry for the village.')
      await waitForEntry(message.channel)
      message.channel.send('Entry closed.')
    }
  }
})

function waitForEntry(channel: TextChannel): Promise<User[]> {
  return new Promise((resolve) => {
    const users: User[] = []
    const limit = 1
    const client = channel.client
    const listener = async (message: Message) => {
      if(message.channel.id === channel.id && message.content === '\\e') {
        console.log('ok')
        if(users.length < limit){
          users.push(message.author)
          await channel.send(`${message.author.username}'s applyed.\nCurrent applyed ${users.map(user => user.username).join(', ')}.`)
          if(users.length >= limit){
            client.off('message', listener)
            resolve(users)
          }
        }
      }
    }
    client.on('message', listener)
  })
}

function wait(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  })
}

client.login(token)
