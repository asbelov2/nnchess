import chess
import chess.engine
import chess.pgn
import random
import numpy
from datetime import datetime
from datetime import timedelta
import tensorflow.keras.models as models
import tensorflow.keras.layers as layers
import tensorflow.keras.utils as utils
import tensorflow.keras.optimizers as optimizers
import tensorflow.keras.callbacks as callbacks

random.seed(1627)

def random_board(max_depth=200):
  board = chess.Board()
  depth = random.randrange(0, max_depth)

  for _ in range(depth):
    all_moves = list(board.legal_moves)
    random_move = random.choice(all_moves)
    board.push(random_move)
    if board.is_game_over():
      break

  return board

def stockfish(board, depth):
  with chess.engine.SimpleEngine.popen_uci('stockfish.exe') as sf:
    result = sf.analyse(board, chess.engine.Limit(depth=depth))
    score = result['score'].white().score()
    return score

squares_index = {
  'a': 0,
  'b': 1,
  'c': 2,
  'd': 3,
  'e': 4,
  'f': 5,
  'g': 6,
  'h': 7
}

# example: h3 -> 17
def square_to_index(square):
  letter = chess.square_name(square)
  return 8 - int(letter[1]), squares_index[letter[0]]


def split_dims(board):
  # this is the 3d matrix
  board3d = numpy.zeros((14, 8, 8), dtype=numpy.int8)

  # here we add the pieces's view on the matrix
  for piece in chess.PIECE_TYPES:
    for square in board.pieces(piece, chess.WHITE):
      idx = numpy.unravel_index(square, (8, 8))
      board3d[piece - 1][7 - idx[0]][idx[1]] = 1
    for square in board.pieces(piece, chess.BLACK):
      idx = numpy.unravel_index(square, (8, 8))
      board3d[piece + 5][7 - idx[0]][idx[1]] = 1

  # add attacks and valid moves too
  # so the network knows what is being attacked
  aux = board.turn
  board.turn = chess.WHITE
  for move in board.legal_moves:
      i, j = square_to_index(move.to_square)
      board3d[12][i][j] = 1
  board.turn = chess.BLACK
  for move in board.legal_moves:
      i, j = square_to_index(move.to_square)
      board3d[13][i][j] = 1
  board.turn = aux

  return board3d


start_time = datetime.now()
# returns the elapsed milliseconds since the start of the program
def millis():
   dt = datetime.now() - start_time
   ms = (dt.days * 24 * 60 * 60 + dt.seconds) * 1000 + dt.microseconds / 1000.0
   return ms

def create_dataset(name, dataset_size):
  i = 0
  b = []
  v = []
  millis()
  while i < dataset_size:
    board = random_board()
    value = stockfish(board, 10)
    b.append(split_dims(board))
    v.append(value)
    if (i%10==0):
      t=millis()
      print(f'{i}/{dataset_size} time {t}')
    i+=1
  numpy.savez(f'content/{name}', b = b, v = v)
  
def build_model(conv_size, conv_depth):
  board3d = layers.Input(shape=(14, 8, 8))
  
  # adding the convolutional layers
  x = board3d
  for _ in range(conv_depth):
    x = layers.Conv2D(filters=conv_size, kernel_size=3, padding='same', activation='relu', data_format='channels_first')(x)
  x = layers.Flatten()(x)
  x = layers.Dense(64, 'relu')(x)
  x = layers.Dense(1, 'sigmoid')(x)

  return models.Model(inputs=board3d, outputs=x)

def get_dataset(name):
  container = numpy.load(f'content/{name}.npz')
  b, v = container['b'], container['v']
  v = numpy.asarray(v / abs(v).max() / 2 + 0.5, dtype=numpy.float32) # normalization (0 - 1)
  return b, v

def minimax_eval(board):
  board3d = split_dims(board)
  board3d = numpy.expand_dims(board3d, 0)
  return model.predict(board3d)[0][0]


def minimax(board, depth, alpha, beta, maximizing_player):
  if depth == 0 or board.is_game_over():
    return minimax_eval(board)
  
  if maximizing_player:
    max_eval = -numpy.inf
    for move in board.legal_moves:
      board.push(move)
      eval = minimax(board, depth - 1, alpha, beta, False)
      board.pop()
      max_eval = max(max_eval, eval)
      alpha = max(alpha, eval)
      if beta <= alpha:
        break
    return max_eval
  else:
    min_eval = numpy.inf
    for move in board.legal_moves:
      board.push(move)
      eval = minimax(board, depth - 1, alpha, beta, True)
      board.pop()
      min_eval = min(min_eval, eval)
      beta = min(beta, eval)
      if beta <= alpha:
        break
    return min_eval


# this is the actual function that gets the move from the neural network
# def get_ai_move(board, depth):
#   max_move = None
#   max_eval = -numpy.inf

#   for move in board.legal_moves:
#     board.push(move)
#     eval = minimax(board, depth - 1, -numpy.inf, numpy.inf, False)
#     board.pop()
#     if eval > max_eval:
#       max_eval = eval
#       max_move = move
  
#   return max_move

# model = build_model(32, 4)
# utils.plot_model(model, to_file='model_plot.png', show_shapes=True, show_layer_names=False)
# x_train, y_train = get_dataset('test')
# model.compile(optimizer=optimizers.Adam(5e-4), loss='mean_squared_error')
# model.summary()
# model.fit(x_train, y_train,
#           batch_size=2048,
#           epochs=1000,
#           verbose=1,
#           validation_split=0.1,
#           callbacks=[callbacks.ReduceLROnPlateau(monitor='loss', patience=10),
#                      callbacks.EarlyStopping(monitor='loss', patience=15, min_delta=1e-4)])
# model.save('model.h5')


create_dataset('test', 1000)
# model = models.load_model('model.h5')
# game = chess.pgn.Game()
# game.headers["Event"] = "AI chess"
# game.headers["Site"] = "Izhevsk"
# game.headers["Date"] = "2022.02.04"
# game.headers["White"] = "nnchess"
# game.headers["Black"] = "Stockfish 14.1"
# game.headers["Result"] = ""
# game.headers["Timezone"] = "UTC"
# game.headers["Termination"] = ""
# board = chess.Board()
# is_started = False
# i=1

# with chess.engine.SimpleEngine.popen_uci('stockfish.exe') as engine:
#   while True:
#     move = get_ai_move(board, 1)
#     board.push(move)
#     print(f'\n{board}')
#     if(is_started == False):
#       node = game.add_variation(move)
#       is_started = True
#     else:
#       node = node.add_variation(move)
#     if board.is_game_over():
#       break

#     move = engine.analyse(board, chess.engine.Limit(time=1), info=chess.engine.INFO_PV)['pv'][0]
#     board.push(move)
#     print(f'\n{board}')
#     node = node.add_main_variation(move)
#     if board.is_game_over():
#       break
# print(game, file=open("aigame.pgn", "w+"), end="\n\n")