import dotenv from 'dotenv'
import playwright from 'playwright'
import { Chess } from 'chess.js'
import util from 'util'
import { exec } from 'child_process'
const execA = util.promisify(exec);

const chess = new Chess()
let playerSide = 'white'
let opponentSide = 'black'
let moveNumber = 1
let renderType = 'svg'

async function doThing() {
	dotenv.config()
	const browser = await playwright['chromium'].launch({
		headless: false,
		executablePath:
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
	})
	const context = await browser.newContext()
	const page = await context.newPage()
	await login(page)
  while(true) {
    await goLiveChess(page)
    while(await acceptChallenge(page)) { await page.waitForTimeout(2000) }
    await playGame(page, chess)
    await page.waitForTimeout(10000)
    // const _ = await (await page.waitForSelector(''))
    // _.asElement
  }
	await browser.close()
}

async function playGame(page, chess) {
	chess = new Chess()
  moveNumber = 1
  console.log('board cleared')
  // TODO: вынести в отдельную функцию
  let blackFlag = false
  try {
    blackFlag = await page.waitForSelector('chess-board.flipped', {timeout: 2000})
    playerSide = blackFlag ? 'black' : 'white'
    opponentSide = blackFlag ? 'white' : 'black'
  } catch {
    try {
      blackFlag = await page.waitForSelector('div.flipped', {timeout: 2000})
      renderType = 'div'
    } catch {
      blackFlag = false
    }
    playerSide = blackFlag ? 'black' : 'white'
    opponentSide = blackFlag ? 'white' : 'black'
  }
  console.log(`my side: ${playerSide}, oppenent's side: ${opponentSide}`)

	while (!chess.game_over()) {
    console.log(`turn #${moveNumber}`)
		if (playerSide === 'white') {
      const move = await AIMove(chess)
      console.log(`my ${moveNumber} move is ${move}`)
			while(await makeMove(page, move, chess)) {}
			while(await waitAndGetOpponentsMove(page, chess)) { await page.waitForTimeout(2000) }
		} else {
			while(await waitAndGetOpponentsMove(page, chess)) { await page.waitForTimeout(2000) }
      if(chess.game_over()) return
      const move = await AIMove(chess)
      console.log(`my ${moveNumber} move is ${move}`)
			while(await makeMove(page, move, chess)) {}
		}
		moveNumber += 1
	}
	console.log(chess.pgn())
}

async function AIMove(chess) {
  console.log('AIMove: fen = ', chess.fen())
  console.log('AIMove: exacting py script to find move')
  const { stdout, stderr } = await execA(`py ../get_ai_move.py "${chess.fen()}"`)
  return stdout
}

async function makeMove(page, move, chess) {
  try {
	  await page.waitForSelector('div.clock-bottom.clock-player-turn')
  } catch {
		console.log('its not my turn')
		return true
	}
  const cellFromS = `div.piece.square-${move.substring(0,2)
		.replace('a','1')
		.replace('b','2')
		.replace('c','3')
		.replace('d','4')
		.replace('e','5')
		.replace('f','6')
		.replace('g','7')
		.replace('h','8')
	}`
  let cellToS = `${move.substring(2,4)
		.replace('a','1')
		.replace('b','2')
		.replace('c','3')
		.replace('d','4')
		.replace('e','5')
		.replace('f','6')
		.replace('g','7')
		.replace('h','8')
	}`
	const cellFrom = await page.waitForSelector(cellFromS)
  await cellFrom.click()
  let cellTo, preCellTo
  try {
	  cellTo = await page.waitForSelector(`div.hint.square-${cellToS}`)
    preCellTo = 'div.hint.square-'
  } catch {
    cellTo = await page.waitForSelector(`div.piece.square-${cellToS}`)
    preCellTo = 'div.piece.square-'
  }
  console.log(`trying to move from ${move.substring(0,2)} to ${move.substring(2,4)}`)
	if(cellFrom && cellTo) {
		await page.dragAndDrop(cellFromS, `${preCellTo}${cellToS}`, {force: true, noWaitAfter:true, timeout:5000})
	}
	chess.move({from: move.substring(0,2), to: move.substring(2,4), promotion: 'q'})
}

async function waitAndGetOpponentsMove(page, chess) {
  console.log("waiting for opponent's move")
  try {
	  await page.waitForSelector('div.clock-top.clock-player-turn', {timeout:5000})
    return true
  } catch {
    const oppMoveNode = (await page.waitForSelector(`div[data-whole-move-number="${moveNumber}"].move > div.${opponentSide}`)).asElement()
		if(!((await oppMoveNode.$$('span')).length) || (await oppMoveNode.$$('span.en-passant-move-icon').length)) {
      console.log(`opponent's ${moveNumber} move is pawn to ${await oppMoveNode.textContent()}`)
      chess.move(await oppMoveNode.textContent())
    } else {
      if((await oppMoveNode.textContent()).includes('='))
      {
        console.log(`opponent's ${moveNumber} move is ${await oppMoveNode.textContent()}${await (await oppMoveNode.$('span')).getAttribute('data-figurine')}`)
        chess.move(`${await oppMoveNode.textContent()}${await (await oppMoveNode.$('span')).getAttribute('data-figurine')}`)
      } else {
        console.log(`opponent's ${moveNumber} move is ${await (await oppMoveNode.$('span')).getAttribute('data-figurine')}${await oppMoveNode.textContent()}`)
        chess.move(`${await (await oppMoveNode.$('span')).getAttribute('data-figurine')}${await oppMoveNode.textContent()}`)
      }
    }
		return false
	}
}

async function goLiveChess(page) {
  try {
    await (await page.waitForSelector('button.ui_outside-close-component', {timeout:1000})).click()
  } catch {}
	await page.goto(
	'https://www.chess.com/play/online/'
	)
  try {
	  const modalCloseBtn = await page.waitForSelector('a[class="icon-font-chess x modal-play-prompt-closeIcon"]', {timeout: 2000})
		if(modalCloseBtn)
      await modalCloseBtn.click()
	} catch {
    console.log('no modal')
  }
  try {
    await (await page.waitForSelector('div[data-tab="newGame"]', {timeout:2000})).click()
  } catch {
    console.log('cant find challenge button')
  }
  try {
    await (await page.waitForSelector('button.ui_outside-close-component', {timeout:1000})).click()
  } catch {}
}

async function acceptChallenge(page) {
  try {
    try {
      await (await page.waitForSelector('button.ui_outside-close-component', {timeout:1000})).click()
    } catch {}
	  const acceptBtn = await page.waitForSelector('button[data-cy="new-game-incoming-challenge-accept"]', {timeout:5000})
		await acceptBtn.click()
    console.log('challenge accepted')
		return false
	} catch {
		console.log('failed to accept challenge')
		return true
	}
}

async function login(page) {
	await page.goto(
	'https://www.chess.com/login/'
	)
  await page.waitForTimeout(1000)
	const login = await page.waitForSelector('form input[type="email"]')
	const password = await page.waitForSelector('form input[type="password"]')
	const loginBtn = await page.waitForSelector('form button[type="submit"]')
	await login.type(process.env.CHESSCOM_LOGIN)
	await password.type(process.env.CHESSCOM_PASSWORD)
	await page.waitForTimeout(1000)
	await loginBtn.click()
  try {
    await (await page.waitForSelector('button.ui_outside-close-component', {timeout:1000})).click()
  } catch {}
}
async function setData(data) {
	process.env.CHESSCOM_LOGIN = data.login
	process.env.CHESSCOM_PASSWORD = data.password
}

await doThing()