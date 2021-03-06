import {promisify} from 'bluebird'
import {gmail} from 'googleapis'
import {map, head, prop, compose, pipe, propOr, cond, propEq, T, equals} from 'ramda'
import authorize, {CLIENT_TOKEN} from './authentication'
import {problem, success} from './messaging'
import {htmlContentFrom, dataFrom} from './parse-html'
import saveResults from './update-spread-sheet'

const {error, log, info} = console

const gMail = gmail('v1')
const list = promisify(gMail.users.messages.list)
const get = promisify(gMail.users.messages.get)

/**
 * @see https://support.google.com/mail/answer/7190?hl=en
 */
const query = `
from:(receipts@newseasonsmarket.com)
subject:(Your New Seasons Market Email Receipt)
newer_than:1d
`

export const connectToEmail = async auth => 
  pipe(
    () => {
      const emails = await list({
        auth,
        userId: 'me',
        maxResults: 1,
        q: query,
      })
      return emails
    },
    propOr('messages', []),
    head,
    prop('id')
  )


export const emailContents = (auth) => async (emailId) => {
  try {
    const {raw} = await get({
      auth,
      userId: 'me',
      id: emailId,
      format: 'raw',
    })
    return new Buffer(raw, 'base64').toString('ascii')
  } catch (e) {
    throw e
    // error(problem('emailContents failed', e))
  }
}

const noEmailsFound = "Missing required parameters: id"

export const run = async () => {
  const auth = await authorize(CLIENT_TOKEN)
  try {
    const emailId = await connectToEmail(auth)()
    const raw = await emailContents(auth)(emailId)
    const html = htmlContentFrom(raw)
    const data = dataFrom(html)
    const status = await saveResults(auth)(data)
  } catch({message, stack}) {
    if (message === noEmailsFound) log('no emails found...')
    else throw new Error(message)
  }
}

const oneHour = 3600000
setInterval(run, oneHour)
