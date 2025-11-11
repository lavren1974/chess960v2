package main

import (
    "errors"
    "fmt"
    "strings"

    chess "github.com/notnil/chess"
    "github.com/notnil/chess/uci"
)

type engineOpts struct {
    movetime int
    depth    int
    multipv  int
    mode     string
}

func buildEngine(side Side, cfg *Config, debug bool, use960 bool) (*uci.Engine, engineOpts, error) {
    var ec *EngineConf
    if side == White { ec = cfg.EngineA } else { ec = cfg.EngineB }

    enginePath := cfg.Engine
    if ec != nil && ec.EnginePath != "" { enginePath = ec.EnginePath }
    if enginePath == "" { return nil, engineOpts{}, errors.New("missing engine path") }

    eng, err := uci.New(enginePath)
    if err != nil { return nil, engineOpts{}, err }
    if debug { uci.Debug(eng) }

    if err := eng.Run(uci.CmdUCI, uci.CmdIsReady, uci.CmdUCINewGame); err != nil {
        return nil, engineOpts{}, err
    }

    setIf := func(name, val string) { _ = eng.Run(uci.CmdSetOption{Name: name, Value: val}) }
    if use960 { setIf("UCI_Chess960", "true") }
    setIf("Ponder", "false")
    if cfg.EnableNNUE != nil {
        setIf("Use NNUE", fmt.Sprintf("%v", *cfg.EnableNNUE))
    } else if ec != nil && ec.EnableNNUE != nil {
        setIf("Use NNUE", fmt.Sprintf("%v", *ec.EnableNNUE))
    }
    mpv := cfg.MultiPV
    if ec != nil && ec.MultiPV != nil { mpv = *ec.MultiPV }
    if mpv > 0 { setIf("MultiPV", fmt.Sprintf("%d", mpv)) }
    h := cfg.HashSizeMB
    if ec != nil && ec.HashSizeMB != nil { h = *ec.HashSizeMB }
    if h > 0 { setIf("Hash", fmt.Sprintf("%d", h)) }
    th := cfg.Threads
    if ec != nil && ec.Threads != nil { th = *ec.Threads }
    if th > 0 { setIf("Threads", fmt.Sprintf("%d", th)) }
    syz := cfg.SyzygyPath
    if ec != nil && ec.SyzygyPath != "" { syz = ec.SyzygyPath }
    if syz != "" { setIf("SyzygyPath", syz) }

    _ = eng.Run(uci.CmdIsReady)

    mv := cfg.TimePerMoveMS
    if ec != nil && ec.TimePerMoveMS != nil { mv = *ec.TimePerMoveMS }
    dp := cfg.SearchDepth
    if ec != nil && ec.SearchDepth != nil { dp = *ec.SearchDepth }
    mode := cfg.SearchMode
    if ec != nil && ec.SearchMode != "" { mode = ec.SearchMode }
    mode = strings.ToLower(mode)
    if mode == "movetime" { mode = "time" }
    if mode != "depth" && mode != "time" { if mv > 0 { mode = "time" } else { mode = "depth" } }

    return eng, engineOpts{movetime: mv, depth: dp, multipv: mpv, mode: mode}, nil
}

func positionFromFENAndMoves(fen string, moves []string) (*chess.Position, []*chess.Move, error) {
    fenOpt, err := chess.FEN(fen)
    if err != nil { return nil, nil, err }
    pos := chess.NewGame(fenOpt).Position()
    var ml []*chess.Move
    for _, m := range moves {
        mv, err := chess.UCINotation{}.Decode(nil, m)
        if err != nil { return nil, nil, err }
        ml = append(ml, mv)
    }
    return pos, ml, nil
}

func collectTopMoves(eng *uci.Engine, pos *chess.Position, moves []*chess.Move, eopts engineOpts) []*chess.Move {
    depth := eopts.depth
    if depth <= 0 { depth = 8 }
    _ = eng.Run(uci.CmdPosition{Position: pos, Moves: moves}, uci.CmdGo{Depth: depth})
    res := eng.SearchResults()
    top := []*chess.Move{}
    if res.Info.Multipv > 0 && len(res.Info.PV) > 0 { top = append(top, res.Info.PV[0]) }
    if res.BestMove != nil { top = append(top, res.BestMove) }
    uniq := map[string]*chess.Move{}
    for _, m := range top { if m != nil { uniq[chess.UCINotation{}.Encode(nil, m)] = m } }
    out := make([]*chess.Move, 0, len(uniq))
    for _, m := range uniq { out = append(out, m) }
    return out
}
