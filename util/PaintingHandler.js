const lwip = require('pajk-lwip');
const Pixel = require('../models/pixel');
const ActionLogger = require("../util/ActionLogger");

const imageSize = 1000;

function PaintingHandler(app) {
    return {
        hasImage: false,
        imageHasChanged: false,
        image: null,
        outputImage: null,
        waitingForImages: [],
        colours: [
            {r: 255, g: 255, b: 255, name:'白色'},
            {r: 228, g: 228, b: 228, name:'浅灰色'},
            {r: 136, g: 136, b: 136, name:'灰色'},
            {r: 34, g: 34, b: 34, name:'黑色'},
            {r: 255, g: 167, b: 209, name:'粉色'},
            {r: 229, g: 0, b: 0, name:'红色'},
            {r: 229, g: 149, b: 0, name:'橙黄色'},
            {r: 160, g: 106, b: 66, name:'棕色'},
            {r: 229, g: 217, b: 0, name:'黄色'},
            {r: 148, g: 224, b: 68, name:'浅绿色'},
            {r: 2, g: 190, b: 1, name:'绿色'},
            {r: 0, g: 211, b: 221, name:'暗绿色'},
            {r: 0, g: 131, b: 199, name:'邦迪蓝'},
            {r: 0, g: 0, b: 234, name:'蓝色'},
            {r: 207, g: 110, b: 228, name:'淡紫色'},
            {r: 130, g: 0, b: 128, name:'紫色'},
        ],

        getBlankImage: function() {
            return new Promise((resolve, reject) => {
                lwip.create(imageSize, imageSize, "white", (err, image) => {
                    if (err) return reject(err);
                    resolve(image);
                });
            });
        },

        loadImageFromDatabase: function() {
            return new Promise((resolve, reject) => {
                let image = this.getBlankImage().then(image => {
                    let batch = image.batch();
                    Pixel.find({}).stream().on("data", pixel => {
                        var x = pixel.xPos, y = pixel.yPos;
                        var colour = { r: pixel.colourR,  g: pixel.colourG, b: pixel.colourB }
                        if(x >= 0 && y >= 0 && x < 1000 && y < 1000) batch.setPixel(x, y, colour);
                    }).on("close", () => {
                        batch.exec((err, image) => {
                            if (err) return reject(err);
                            this.hasImage = true;
                            this.image = image;
                            this.setPixelCount = 0;
                            this.imageBatch = this.image.batch();
                            app.websocketServer.broadcast("server_ready");
                            resolve(image);
                        });
                    }).on("error", err => reject(err));
                }).catch(err => {
                    reject(err);
                })
            });
        },

        getOutputImage: function() {
            return new Promise((resolve, reject) => {
                if (this.outputImage && !this.imageHasChanged) return resolve(this.outputImage);
                console.log("Generating new output image!");
                this.generateOutputImage().then((outputImage) => resolve(outputImage)).catch((err) => reject(err));
            })
        },

        generateOutputImage: function() {
            var a = this;
            return new Promise((resolve, reject) => {
                this.waitingForImages.push((err, buffer) => {
                    if (err) return reject(err);
                    resolve(buffer);
                })
                if(this.waitingForImages.length == 1) {
                    this.imageBatch.toBuffer("png", { compression: "fast", transparency: false }, (err, buffer) => {
                        a.outputImage = buffer;
                        a.imageHasChanged = false;
                        a.waitingForImages.forEach(callback => {
                            callback(err, buffer);
                        })
                        a.waitingForImages = [];
                    })
                }
            })
        },

        getColourRGB: function(colourID) {
            let colour = this.colours[colourID];
            if (!colour) return false;
            return colour;
        },

        doPaint: function(colour, x, y, user) {
            var a = this;
            return new Promise((resolve, reject) => {
                if(!this.hasImage) return reject({message: "Server not ready", code: "not_ready"});
                if(app.temporaryUserInfo.isUserPlacing(user)) return reject({message: "You cannot place more than one tile at once.", code: "attempted_overload"});
                app.temporaryUserInfo.setUserPlacing(user, true);
                // Add to DB:
                user.addPixel(colour, x, y, (changed, err) => {
                    app.temporaryUserInfo.setUserPlacing(user, false);
                    if(err) return reject(err);
                    // Paint on live image:
                    a.setPixelCount += 1;
                    a.imageBatch.setPixel(x, y, colour);
                    if (a.setPixelCount >= 50) {
                        a.setPixelCount = 0;
                        a.imageBatch.exec((err, image) => {
                            if (image) {
                                a.imageHasChanged = true;
                                a.generateOutputImage();
                            }
                        })
                    }
                    // Send notice to all clients:
                    var info = {x: x, y: y, colour: colour, userID: user.id};
                    app.websocketServer.broadcast("tile_placed", info);
                    ActionLogger.log("place", user, null, info);
                    app.leaderboardManager.needsUpdating = true;
                    resolve();
                });
            });
        }
    }
}

PaintingHandler.prototype = Object.create(PaintingHandler.prototype);

module.exports = PaintingHandler;
