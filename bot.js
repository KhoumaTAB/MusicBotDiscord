require("dotenv").config();
const { Client, Util } = require("discord.js");
const YouTube = require("simple-youtube-api");
const ytdl = require("ytdl-core");

const client = new Client({ disableEveryone: true });

const youtube = new YouTube(process.env.GOOGLEAPI);

const queue = new Map();

client.on("ready", () => console.log("Je suis connecté!"));

client.on("message", async msg => {
  if (msg.author.bot) {
    undefined;
  }
  if (!msg.content.startsWith(process.env.PREFIX)) {
    undefined;
  }

  const args = msg.content.split(" ");
  const searchString = args.slice(1).join(" ");
  const url = args[1] ? args[1].replace(/<(.+)>/g, "$1") : "";
  const serverQueue = queue.get(msg.guild.id);

  let command = msg.content.toLowerCase().split(" ")[0];
  command = command.slice(process.env.PREFIX.length);

  if (command === "play") {
    const voiceChannel = msg.member.voiceChannel;
    if (!voiceChannel) {
      msg.channel.send(
        `Je suis désolé ${
          msg.member.displayName
        } tu dois être dans un channel vocal !`
      );
      return undefined;
    }

    const permissions = voiceChannel.permissionsFor(msg.client.user);
    if (!permissions.has("CONNECT")) {
      msg.channel.send(
        "Je ne peux pas me connecter au channel, est-ce que j'ai la permission ?"
      );
      return undefined;
    }
    if (!permissions.has("SPEAK")) {
      msg.channel.send(
        "Je ne peux pas parler dans le channel, est-ce que j'ai la permission ?"
      );
      return undefined;
    }

    if (url.match(/^https?:\/\/(www.youtube.com|youtube.com)\/playlist(.*)$/)) {
      const playlist = await youtube.getPlaylist(url);
      const videos = await playlist.getVideos();
      for (const video of Object.values(videos)) {
        const video2 = await youtube.getVideoByID(video.id);
        await handleVideo(video2, msg, voiceChannel, true);
      }
      msg.channel.send(`✅ Playlist: **${playlist.title}** a été ajouté !`);
    } else {
      try {
        let video = await youtube.getVideo(url);
      } catch (error) {
        try {
          let videos = await youtube.searchVideos(searchString, 10);
          let index = 0;
          msg.channel.send(`
__**Song selection:**__

${videos.map(video2 => `**${++index} -** ${video2.title}`).join("\n")}

Veuillez entrer un numéro correspondant à la musique de votre choix.
					`);
          try {
            var response = await msg.channel.awaitMessages(
              msg2 => msg2.content > 0 && msg2.content < 11,
              {
                maxMatches: 1,
                time: 60000,
                errors: ["time"]
              }
            );
          } catch (err) {
            console.error(err);
            msg.channel.send(
              "Pas de numéro entré ou incorrect, selection annulée."
            );
          }
          const videoIndex = parseInt(response.first().content);
          var video = await youtube.getVideoByID(videos[videoIndex - 1].id);
        } catch (err) {
          console.error(err);
          msg.channel.send("🆘 Je n'ai obtenu aucune réponse.");
        }
      }
      handleVideo(video, msg, voiceChannel);
    }
  } else if (command === "skip") {
    if (!msg.member.voiceChannel) {
      msg.channel.send(
        `${msg.member.displayName} n'est pas dans un channel vocal !`
      );
      return undefined;
    }
    if (!serverQueue) {
      msg.channel.send("Il n'y a rien dans la playlist.");
      return undefined;
    }
    serverQueue.connection.dispatcher.end(
      `${msg.member.displayName} vient de passer à la musique suivante !`
    );
    undefined;
  } else if (command === "stop") {
    if (!msg.member.voiceChannel) {
      msg.channel.send(
        `${msg.member.displayName} n'est pas dans un channel vocal !`
      );
      return undefined;
    }
    if (!serverQueue) {
      msg.channel.send("Il n'y a rien dans la playlist.");
      return undefined;
    }
    serverQueue.songs = [];
    serverQueue.connection.dispatcher.end(
      `${msg.member.displayName} vient d'arrêter la musique !`
    );
    msg.channel.send(`${msg.member.displayName} vient d'arrêter la musique`);
    undefined;
  } else if (command === "volume") {
    if (!msg.member.voiceChannel) {
      msg.channel.send("Tu n'es pas dans un channel vocal!");
      return undefined;
    }
    if (!serverQueue) {
      msg.channel.send("Il n'y a rien dans la playlist.");
      return undefined;
    }
    if (!args[1]) {
      msg.channel.send(`Le volume actuel est à: **${serverQueue.volume}**`);
      return undefined;
    }
    serverQueue.volume = args[1];
    serverQueue.connection.dispatcher.setVolumeLogarithmic(args[1] / 5);
    msg.channel.send(`J'ai mis le volume à: **${args[1]}**`);
  } else if (command === "np") {
    if (!serverQueue) {
      msg.channel.send("Il n'y a rien dans la playlist.");
    }
    msg.channel.send(`🎶 Now playing: **${serverQueue.songs[0].title}**`);
  } else if (command === "queue") {
    if (!serverQueue) {
      msg.channel.send("Il n'y a rien dans la playlist.");
    }
    msg.channel.send(`
__**Playlist:**__

${serverQueue.songs.map(song => `**-** ${song.title}`).join("\n")}

**Now playing:** ${serverQueue.songs[0].title}
		`);
  } else if (command === "pause") {
    if (serverQueue && serverQueue.playing) {
      serverQueue.playing = false;
      serverQueue.connection.dispatcher.pause();
      msg.channel.send(
        `⏸ ${msg.member.displayName} a mis la musique en pause !`
      );
    } else {
      msg.channel.send("Il n'y a rien dans la playlist.");
    }
  } else if (command === "resume") {
    if (serverQueue && !serverQueue.playing) {
      serverQueue.playing = true;
      serverQueue.connection.dispatcher.resume();
      msg.channel.send(`▶ ${msg.member.displayName} a relancé la musique !`);
    } else {
      msg.channel.send("Il n'y a rien dans la playlist.");
    }
  }
  undefined;
});

async function handleVideo(video, msg, voiceChannel, playlist = false) {
  const serverQueue = queue.get(msg.guild.id);
  console.log(video);
  const song = {
    id: video.id,
    title: Util.escapeMarkdown(video.title),
    url: `https://www.youtube.com/watch?v=${video.id}`
  };
  if (!serverQueue) {
    const queueConstruct = {
      textChannel: msg.channel,
      voiceChannel: voiceChannel,
      connection: null,
      songs: [],
      volume: 5,
      playing: true
    };
    queue.set(msg.guild.id, queueConstruct);

    queueConstruct.songs.push(song);

    try {
      let connection = await voiceChannel.join();
      queueConstruct.connection = connection;
      play(msg.guild, queueConstruct.songs[0]);
    } catch (error) {
      console.error(`Je ne peux rejoindre le channel vocal: ${error}`);
      queue.delete(msg.guild.id);
      msg.channel.send(`Je ne peux rejoindre le channel vocal: ${error}`);
    }
  } else {
    serverQueue.songs.push(song);
    console.log(serverQueue.songs);
    if (playlist) {
      undefined;
    } else {
      msg.channel.send(`✅ **${song.title}** a été ajouté!`);
    }
  }
  undefined;
}

function play(guild, song) {
  const serverQueue = queue.get(guild.id);

  if (!song) {
    serverQueue.voiceChannel.leave();
    queue.delete(guild.id);
    return;
  }
  console.log(serverQueue.songs);

  const dispatcher = serverQueue.connection
    .playStream(ytdl(song.url))
    .on("end", reason => {
      if (reason === "Stream is not generating quickly enough.") {
        console.log("Song ended.");
      } else {
        console.log(reason);
      }
      serverQueue.songs.shift();
      play(guild, serverQueue.songs[0]);
    })
    .on("error", error => console.error(error));
  dispatcher.setVolumeLogarithmic(serverQueue.volume / 5);

  serverQueue.textChannel.send(`🎶 Start playing: **${song.title}**`);
}

client.on("message", msg => {
  if (msg.content === "ping") {
    msg.reply(
      `Le **BOT** a mis **${msg.createdTimestamp -
        msg.createdTimestamp} Ms** pour repondre.\nEt l'**API** a mis **${Math.round(
        client.ping
      )} Ms** pour repondre`
    );
  }
});

client.login(process.env.TOKEN);
