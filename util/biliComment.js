
const User = require('../models/user');
const ChatMessage = require('../models/chatMessage');

var CommentSocket = require('./lib/v2/comment_socket').Client;
module.exports = function (app, cid) {

    var server = new CommentSocket({});

    server.on('server_error', function(error) {
        console.error(900, "服务器发生错误: " + error);
    });

    server.on('close', function() {
        console.error(3);
        server.connect(cid);
    });

    server.on('error', function(error) {
        console.error(901, "发生错误: " + error);
    });

    /**
     * [Event] 登陆成功 / 心跳包
     */
    server.on('login_success', function(num) {
        // if(run_config.recorder){ //记录下来
        //     run_config.recorder.write(1, {action:"watcherNum", num:num});
        // }
    });

    /**
     * [Event] 有新的弹幕或者信息
     */
    server.on('newCommentString', function(data) {
        //server bili-live: playtime(stime) mode fontsize color timestamp(date) rnd pool bili-userID bili-danmuID message
        //xml: stime mode fontsize color date pool? bili-userID bili-danmuID
        var date, msg, username = '', text = '', info;

        //普通视频 length==2 ; live length==3
        // if(!data && !data.cmd) return util.Comment.cout("[系统] ".bold.yellow + "异常数据".red);

        switch (data.cmd) { //操作命令
            case 'DANMU_MSG': //弹幕
                info = data.info;//ignore other arguments
                //获取时间
                date = info[0][4];
                msg = info[1];
                var uname = info[2][1].replace(/\//g, '');
                var uid = info[2][0];
                console.log(date,uname,uid,msg);

                var reg = /#(\d{1,4})-(\d{1,4})-(\d{1,2})#/;
                var msgResult = reg.exec(msg);
                if (msgResult != null && msgResult.length>=4) {
                    var x = parseInt(msgResult[1],10);
                    var y = parseInt(msgResult[2],10);
                    var colour = parseInt(msgResult[3],10);
                    if (x >= 0 && x <= 1000 && y >= 0 && y <= 1000 && colour >= 1 && colour <= 16) {
                        console.log(uname, uid, x, y, colour);
                        var rgb = app.paintingHandler.getColourRGB(colour - 1);
                        User.findByUsername(uname, function (err, user) {
                            if (err) return console.error(err);
                            if (user != null) {
                                console.log('findUser-danmu', user.id);
                                paintWithUser(user, x, y, rgb);
                            } else {
                                User.register(uname, uid, function (user, error) {
                                    if (error) return console.log(error);
                                    console.log('newUser-danmu', user.id, uname, uid);
                                    paintWithUser(user,x,y,rgb);
                                }, 'bilibili_' + uid, 'bilibili')
                            }
                        })
                    }
                }

            function paintWithUser(user, x, y, rgb) {
                if (!user.canPlace()) return console.log('too fast', uname);
                app.paintingHandler.doPaint(rgb, x, y, user).then(pixel => {
                    // return User.findById(user.id).then(user => {
                    //     var seconds = user.getPlaceSecondsRemaining();
                    //     var countData = {canPlace: seconds <= 0, seconds: seconds};
                    //     console.log(user.OAuthID, seconds);
                    // }).catch(err => console.error(err, 'paintError'));
                    return ChatMessage.createMessage(app, user.id, `填充了${rgb.name}`, x, y).then(message => {
                        var info = message.getInfo().then(info => {
                            app.websocketServer.broadcast("new_message", info);
                        }).catch(err => app.reportError(err))
                    }).catch(err => {
                        return app.reportError(err);
                    })
                }).catch(err => {
                    console.error("Error placing pixel: ", err);
                });
            }

                break;
            case 'SEND_GIFT': //礼物
                info = data.data;//ignore other arguments

                // if(run_config.settings.show_gift) {
                //     date = util.DateFormat(info.timestamp, 'hh:mm:ss');
                //     if(run_config.settings.showTime) text += ('[' + date + '] ').toString().yellow;
                //     text += lang.comment_cmds[data.cmd].bold.magenta;
                //     text += (info.uname).bold.cyan + info.action + info.giftName.bold.red + ("*" + info.num).bold;
                //
                //     util.Comment.cout(text);
                //
                //     //Add play speech
                //     play_speech("up主在此墙裂感谢!" + info.uname + info.action + info.giftName + "乘以" + info.num);
                // }
                break;
            case 'WELCOME':
                info = data.data;//ignore other arguments

                console.log(data);

                User.findByUsername(info.uname, function (err, user) {
                    if (err) console.error(err);
                    if (user != null) {
                        console.log('findUser', user.id);
                    } else {
                        User.register(info.uname, info.uid, function (user, error) {
                            console.log('newUser', user.id, info.uname, info.uid);
                        }, 'bilibili_' + info.uid, 'bilibili')
                    }
                })

                break;
            case 'SYS_GIFT':
                // if(run_config.settings.show_gift) {
                //     text += lang.comment_cmds[data.cmd].bold.green;
                //     text += data.msg.bold;
                // }
                break;
            default:
            //console.log(data);
        }
    });

    /**
     * [Event] 滚动信息
     *
     * data -> json {text:"",highlight:?,bgcolor:?,flash:?,tooltip:?}
     */
    server.on('newScrollMessage', function(data) {

    });

    /**
     * [Event] 未知数据包
     */
    server.on('unknown_bag', function(data) {
        console.error(902, "异常数据: " + data);
    });

    return server;
};