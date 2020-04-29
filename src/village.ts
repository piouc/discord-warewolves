import Discord, {Client, Message, Channel, User, TextChannel, MessageReaction, PartialUser} from 'discord.js'
import { create } from 'domain';

export enum Job {
  Villagger = '村人',
  Thief = '怪盗',
  Seer = '占い師',
  Warewolf = '人狼',
  Hangman = '吊り人',
  Madman = '狂人'
}

export enum Team {
  Villagger = '村人チーム',
  Warewolf = '人狼チーム',
  Hangman = '吊り人チーム'
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
  }

  async start(){
    this.started = true

    const afterActions = await Promise.all<void | AfterAction>(this.players.map(async player => {
      const otherPlayers = excludePlayer(this.players, player)
      switch(player.job){

        case Job.Villagger:
          await player.send('あなたの役職は "村人" です')
          await this.waitForReact({
            emojiMap: new Map([['👌', null]]),
            message: '確認したら👌をクリックしてください。',
            target: player.user
          })
          return
          
        case Job.Seer:
          const divinedPlayer = await this.waitForSelect({
            target: player.user,
            emojiMap: createEmojiMap<Player | null>([...otherPlayers, null]),
            message: 'あなたの役職は "占い師" です。\n誰を占いますか?',
            valueResolver: player => player ? player.name : '欠けた2つの役職'
          })

          if(divinedPlayer){
            await player.send(`”${divinedPlayer.name}” は ”${player.job}” です。`)
          } else {
            await player.send(`割り当てられなかった役職は ${this.unassignedJobs.map(job => `"${job}"`).join('・')} です。`)
          }
          return

        case Job.Thief:
          const targetPlayer = await this.waitForSelect({
            target: player.user,
            emojiMap: createEmojiMap(otherPlayers),
            message: 'あなたの役職は "怪盗" です。\nだれと交換しますか?',
            valueResolver: player => player.name
          })
          await player.send(`"${targetPlayer.name}" と交換し、あなたは "${targetPlayer.job}" になりました。`)
          return async (village: Village) => {
            const targetJob = targetPlayer.job
            targetPlayer.job = player.job
            player.job = targetJob
          }

        case Job.Warewolf:
          const otherWarewolf = otherPlayers.filter(player => player.job === Job.Warewolf)
          await player.send(`あなたの役職は "人狼" です。\n仲間の人狼は ${otherWarewolf.length > 0 ? otherWarewolf.map(player => `"${player.name}"`).join('・') + ' です。' : 'いません。'}`)
          await this.waitForReact({
            emojiMap: new Map([['👌', null]]),
            message: '確認したら👌をクリックしてください。',
            target: player.user
          })
          return

        case Job.Hangman:
          await player.send('あなたの役職は "吊り人" です。')
          await this.waitForReact({
            emojiMap: new Map([['👌', null]]),
            message: '確認したら👌をクリックしてください。',
            target: player.user
          })
          return
        
        case Job.Madman:
          await player.send('あなたの役職は "狂人" です。')
          await this.waitForReact({
            emojiMap: new Map([['👌', null]]),
            message: '確認したら👌をクリックしてください。',
            target: player.user
          })
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

    await this.channel.send(`議論タイムを開始します。\n${this.players.length}分`)
    // await wait(1000 * 60 * this.players.length)
    await this.channel.send(`議論タイムを終了します。`)

    const votes: VoteMap = new Map(await Promise.all(this.players.map<Promise<[Player, Player]>>(async player => {
      const otherPlayers = excludePlayer(this.players, player)
      return [
        player,
        await this.waitForSelect({
          target: player.user,
          message: 'だれを処刑しますか?',
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
      this.winners = this.executedPlayers.length === 0　? this.players.filter(byJob([Job.Villagger, Job.Seer, Job.Thief, Job.Madman])) : this.players.filter(byJob([Job.Villagger, Job.Seer, Job.Thief]))
      this.winTeam = Team.Villagger
    } else if(this.players.some(byJob([Job.Warewolf])) && !this.executedPlayers.some(byJob([Job.Warewolf]))){
      this.winners = this.players.filter(player => [Job.Warewolf].includes(player.job))
      this.winTeam = Team.Warewolf
    } else {
      this.winners = []
    }

    if(this.executedPlayers.length > 0){
      await this.channel.send(`投票の結果 ${this.executedPlayers.map(player => player.name).map(quote).join('・')} が処刑されました。`)
    } else {
      await this.channel.send('投票の結果、だれも処刑されませんでした。')
    }
    await this.channel.send(`・・・
**【${this.winTeam? this.winTeam + 'が勝利しました！' : '勝利プレイヤーはいませんでした'}】**

勝利プレイヤーは ${this.winners.length < 1 ? 'いない' : this.winners.map(player => player.name).map(quote).join('・')} です。

【役職の割り当て】
${this.players.map(player => {
  if(player.job === player.originalJob){
    return `・${player.name}：${player.job}`
  } else {
    return `・${player.name}：${player.originalJob} → ${player.job}`
  }
}).join('\n')}

●割り当てられなかった役職
${this.unassignedJobs.join('・')}`)
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
    const optionListText = Array.from(emojiMap.entries(), ([emoji, value]) => `${emoji}：${valueResolver(value)}`).join('\n')
    return await this.waitForReact({
      message: `${message}\n${optionListText}`,
      target,
      emojiMap
    })
  }
  
}

function quote(value: any){
  return `"${value}"`
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

function wait(ms: number): Promise<void>{
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  })
}