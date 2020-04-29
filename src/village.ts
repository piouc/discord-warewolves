import Discord, {Client, Message, Channel, User, TextChannel, MessageReaction, PartialUser} from 'discord.js'
import { create } from 'domain';

export enum Job {
  Villagger = 'Villagger',
  Thief = 'Thief',
  Seer = 'Seer',
  Warewolf = 'Warewolf',
  Hangman = 'Hangman',
  Madman = 'Madman'
}

export enum Team {
  Villagger = 'Team Villaggers',
  Warewolf = 'Team Warewolves',
  Hangman = 'Team Hangmans'
}

type Action = (village: Village) => Promise<AfterAction | void>
type AfterAction = (village: Village) => Promise<void>

export class Player{
  user: User
  job: Job
  originalJob: Job
  constructor({user, job}: {user: User, job: Job}){
    this.user = user
    this.job = job
    this.originalJob = job
  }

  async action(village: Village): Promise<AfterAction | undefined> {
    return
  }

  async isWin(village: Village): Promise<boolean> {
    throw new Error('Player#isWin is not callable.')
  }

  send(...args: Parameters<User['send']>){
    return this.user.send(...args)
  }

  get name(): string{
    return this.user.username
  }
}

type JobMap = Map<User, Job>
type EmojiMap<T> = Map<string, T>
type VoteMap = Map<Player, Player>

export class Village {
  client: Client
  channel: TextChannel
  owner: User
  users: User[]
  players: Player[]
  jobMap?: JobMap
  jobs: Job[]
  unassignedJobs: Job[]
  executedPlayers?: Player[]
  winners?: Player[]
  started: boolean = false
  executed: boolean = false
  ended: boolean = false
  maxVoteCount?: number
  winTeam?: Team
  constructor({
    channel,
    owner,
    users,
    jobs,
    client
  }: {
    client: Client,
    channel: TextChannel,
    owner: User,
    users: User[],
    jobs: Job[]
  }){
    this.client = client
    this.channel = channel
    this.owner = owner
    this.users = users
    this.jobs = jobs

    const [jobMap, unassignedJobs] = randomAssign(users, jobs)
    this.players = [...jobMap].map(([user, job]) => new Player({user, job}))
    this.unassignedJobs = unassignedJobs
    console.log(jobs, jobMap, unassignedJobs)
  }

  async start(){
    this.started = true

    const afterActions = await Promise.all<void | AfterAction>(this.players.map(async player => {
      const otherPlayers = excludePlayer(this.players, player)
      switch(player.job){

        case Job.Villagger:
          await player.send('Your job is "Villagger"')
          return
          
        case Job.Seer:
          const divinedPlayer = await this.waitForSelect({
            target: player.user,
            emojiMap: createEmojiMap<Player | null>([...otherPlayers, null]),
            message: 'Your job is "Seer.\nWho divine for?',
            valueResolver: player => player ? player.name : 'Unassigned players'
          })

          if(divinedPlayer){
            await player.send(`'${divinedPlayer.name}' is ${player.job}`)
          } else {
            await player.send(`Unassigned jobs is ${this.unassignedJobs.join(', ')}`)
          }
          return

        case Job.Thief:
          const targetPlayer = await this.waitForSelect({
            target: player.user,
            emojiMap: createEmojiMap(otherPlayers),
            message: 'Your job is "Thief"\nWho change for?',
            valueResolver: player => player.name
          })
          await player.send(`Change with ${targetPlayer.name}.\nYour new job is ${targetPlayer.job}`)
          return async (village: Village) => {
            const targetJob = targetPlayer.job
            targetPlayer.job = player.job
            player.job = targetJob
          }

        case Job.Warewolf:
          const otherWarewolf = otherPlayers.filter(player => player.job === Job.Warewolf)
          await player.send(`Your job is "Warewolf"\n${otherWarewolf.map(player => player.name).join()}\nTeam member is ${otherWarewolf.map(player => player.name).join(', ')}`)
          return

        case Job.Hangman:
          await player.send('Your job is "Hangman"')
          return
        
        case Job.Madman:
          await player.send('Your job is "Madman"')
          return
          
        default:
          const _: never = player.job
      }
    }))

    await Promise.all(afterActions.map(async action => {
      if(action){
        await action(this)
      }
    }))

    const votes: VoteMap = new Map(await Promise.all(this.players.map<Promise<[Player, Player]>>(async player => {
      const otherPlayers = excludePlayer(this.players, player)
      return [
        player,
        await this.waitForSelect({
          target: player.user,
          message: 'Who execute for?',
          emojiMap: createEmojiMap(otherPlayers),
          valueResolver: player => player.name
        })
      ]
    })))
    

    const voteCount = count([...votes.values()])
    this.maxVoteCount = Math.max(...voteCount.values())
    this.executedPlayers = [...voteCount].filter(([player, count]) => count === this.maxVoteCount).map(([player]) => player)
    if(this.executedPlayers.length === this.players.length){
      this.executedPlayers = []
    }
    this.executed = true


    if(this.executedPlayers.some(byJob([Job.Hangman]))){
      this.winners = this.players.filter(byJob([Job.Hangman]))
      this.winTeam = Team.Hangman
    } else if(this.executedPlayers.some(byJob([Job.Warewolf])) || (this.executedPlayers.length === 0 && !this.players.some(byJob([Job.Warewolf])))){
      this.winners = this.players.filter(byJob([Job.Villagger, Job.Seer, Job.Thief]))
      this.winTeam = Team.Villagger
    } else if(this.players.some(byJob([Job.Warewolf])) && !this.executedPlayers.some(byJob([Job.Warewolf]))){
      this.winners = this.players.filter(player => [Job.Warewolf].includes(player.job))
      this.winTeam = Team.Warewolf
    } else {
      this.winners = []
    }

    await this.channel.send(`Win team is ${this.winTeam ? this.winTeam : 'none'}\nWinner is ${this.winners.map(player => player.name).join(', ')}`)
    await this.channel.send(`Assigned job:\n${this.players.map(player => {
      if(player.job === player.originalJob){
        return `${player.name}: ${player.originalJob} -> ${player.job}`
      } else {
        return `${player.name}: ${player.job}`
      }
    }).join('\n')}\n\nUnassigned jobs:\n${this.unassignedJobs.join('\n')}`)
  }

  async waitForReact<T>({target, message, emojiMap} : {target: TextChannel | User, message: string, emojiMap: EmojiMap<T>}): Promise<T>{
    return new Promise(async resolve => {
      let resolved = false
      const askMessage = await target.send(message)
      const listener = async (reaction: MessageReaction, user: User | PartialUser) => {
        if(reaction.message.id === askMessage.id && emojiMap.has(reaction.emoji.name) && user.id !== askMessage.author.id){
          resolved = true
          this.client.off('messageReactionAdd', listener)
          this.client.off('messageReactionRemove', listener)
          resolve(emojiMap.get(reaction.emoji.name))
        }
      }
      this.client.on('messageReactionAdd', listener)
      this.client.on('messageReactionRemove', listener)
      for(let emoji of Array.from(emojiMap.keys())){
        if(resolved) break
        await askMessage.react(emoji)
      }
    })
  }

  async waitForSelect<T>({
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
    return await this.waitForReact({
      message: `${message}\n${optionListText}`,
      target,
      emojiMap
    })
  }
  
}

function byJob(jobs: Job[]){
  return (player: Player) => jobs.includes(player.job)
}

function count<T>(arr: T[]){
  const res = new Map<T, number>()
  arr.forEach(value => {
    res.set(value, (res.get(value) ?? 0) + 1)
  })
  return res
}

function isNullish(value: any): value is null | undefined {
  return value === null || typeof value === 'undefined'
}

function createEmojiMap<T>(values: T[]): EmojiMap<T> {
  const emojis = ['🍎', '🌽', '🍕', '🍙', '🍣', '🍡', '🎂', '🍭', '☕']
  return new Map(values.map((value, i) => [emojis[i], value]))
}

function excludePlayer(arr: Player[], target: Player){
  return exclude(arr, target, (a, b) => a.user.id === b.user.id)
}

function exclude<T>(arr: T[], target: T, comparator = (a: T, b: T) => a === b): T[]{
  return arr.filter(value => !comparator(value, target))
}

function randomNumber(num: number): number{
  return Math.floor(Math.random() * num)
}

function randomAssign(users: User[], jobs: Job[]): [JobMap, Job[]] {
  const sourceJobs = [...jobs]
  const jobMap: JobMap = new Map()
  users.forEach(user => jobMap.set(user, sourceJobs.splice(randomNumber(sourceJobs.length), 1)[0]))
  return [jobMap, sourceJobs]
}

