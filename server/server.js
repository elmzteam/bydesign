module.exports = function(__dirname) {
	/**
	  * Imports and Initializations
	**/

	var crypto      = require("crypto")
	var path        = require("path")
	var config      = require("../config")
	var utils       = require("./utils")

	var pm          = require("promised-mongo")
	var db          = pm("mongodb://localhost/bydesign", ["authors", "posts"])

	var handlebars  = require("handlebars")
	    handlebars  = require("./stachehelper")(handlebars, config.paths.client)

	var insert      = require("./insertPost")(db, config.paths.client)
	var Renderer    = require("./renderer")
	var api         = require("./api")(db)

	var express     = require("express")
	var app         = express()

	var cookie      = require("cookie-parser")
	var body        = require("body-parser")
	var multer      = require("multer")
	/** Won't work on windows probably **/
	var upload      = multer({dest: '/tmp/'})
	var session     = require("express-session")
	var MongoStore  = require("connect-mongo")(session)

	var Google      = require('passport-google-oauth').OAuth2Strategy
	var passport    = require("passport")

	var logger      = require("./logger")
	var morgan      = require("morgan")
	var utils       = require("./utils")
	var fs          = utils.fs

	var renderer = new Renderer(__dirname, db, handlebars);

	/**
	  * Middleware Initialization
	**/

	app.use(morgan("dev"))
	app.use(cookie())
	app.use(body.json())
	app.use(session({ secret: 'temporarysecret', store: new MongoStore({
		url: "mongodb://localhost/bydesign"
	}),
		resave: true,
		saveUninitialized: true,
	}))
	app.use(passport.initialize())
	app.use(passport.session())
	app.use(renderer.handle.bind(renderer))
	app.use(api)

	/**
	  * Annotations
	**/ 

	var requireAdmin = (fn) =>
		(req, res) => {
			if (req.user) {
				return fn(req, res)
			} else {
				req.status(403)
				res.send("Please Log In first")
			}
		}

	/**
	  * App routing
	**/

	app.use(express.static("build"))
	app.use("/upload", express.static(config.paths.upload))

	app.post("/visible", requireAdmin(function(req, res) {
		handleVisibility(req.body.state, req.body.page).
			then(function() {
				res.status(200)
				res.send({
					"state": req.body.state ? "visible" : "hidden",
					"visible": req.body.state
				})
				renderer.reload()
			}).
			catch(function(err) {
				res.status(500)
				res.send({
					"state": !req.body.state ? "visible" : "hidden",
					"visible": !req.body.state
				})
				logger.error(err)
			})
	}))

	app.post("/static/", upload.single('file'), requireAdmin(function(req, res) {
		let hash = req.file.filename.slice(0,8)
		let sluggedFile = req.file.originalname
					.split(".")
					.map((e) => utils.slugify(e))
					.join(".")
		// No directory traversals in my house
		sluggedFile = sluggedFile.replace(/\.(\.)+/g, "")
		let prefixName = `${hash}-${sluggedFile}`
		fs.rename(req.file.path, path.join(__dirname, config.paths.upload, prefixName)) 
			.then( () => res.send({path: path.join("/upload/", prefixName), 
		        	file: prefixName,
		        	shortFile: sluggedFile
			})).catch( (e) => {
				logger.error(e)
				res.status(500).send({error: "Could not upload file"})
			})
	}))

	app.delete("/static/:FILE", requireAdmin(function(req, res) {
		var filePath = path.join(__dirname, config.paths.upload, req.params.FILE)
		fs.stat(filePath).then( (stat) => {
			if (stat && stat.isFile()) {
				//All Good!
				return
			} else {
				throw new Error("File Not Found")
			}
		}).then(fs.unlink(filePath)).then( () => {
			return res.send({success: true})
		}).catch( (e) => {
			logger.error(e)
			res.status(503).send({error: "Resource unavailable", success: false})
		})
	}))

	app.post("/editor/", requireAdmin(function(req, res) {
		uploadPost(null, req.body, req.user.id)
			.then(function (id) {
				renderer.reload()
				res.send({msg: "Ok", id: id})
			})
			.catch(logger.error)
	}))

	app.post("/editor/:MOD", requireAdmin(function(req, res) {
		uploadPost(req.params.MOD, req.body, req.user.id)
			.then(renderer.reload.bind(renderer))
			.catch(logger.error)
		res.send({msg: "Ok"})
	}))

	/**
	  * Upload Handling
	**/

	var uploadPost = function(guid, body, author) {
		if (body.tags.length == 0 && body.title.match(/^\s*$/) && body.content.match(/^\s*$/) && guid) {
			return db.posts.remove({ guid });
		}

		if (!guid) {
			return utils.generateId(db.posts)
				.then((id) =>
					db.posts.insert({
						tags: body.tags,
						visible: body.visible === true,
						author: author,
						timestamp: Date.now(),
						guid: id,
						title: {
							text: body.title,
							url: `/posts/${id}`
						},
						slug: utils.slugify(body.title),
						content: body.content
					})
						.then(() => id)
				);
		} else {
			return db.posts.update({ guid }, {
				$set: {
					"title.text": body.title,
					"content": body.content,
					"tags": body.tags
				}
			});
		}
	}

	var handleVisibility = function(visible, guid) {
		return db.posts.update({ guid }, { $set: { visible }});
	}

	/**
	  * MongoDB access functions
	**/

	var getAuthors = function(gid) {
		return db.authors.findOne({ gid });
	}

	/**
	  * Authentication using Passport OAuth
	**/

	passport.serializeUser(function(user, done) {
		db.authors.findOne({"id": user.id})
			.then((data) => {
				if (data !== undefined && data !== null) {
					user._json.image.url = user._json.image.url.replace(/sz=50$/, "sz=576");
					return db.authors.update({"id": user.id}, user).then(() => done(undefined, JSON.stringify(user)));
				} else {
					return db.authors.insert(user).then(() => done(undefined, JSON.stringify(user)))
				}
		})
			.catch((err) => done(err, JSON.stringify(user)))
	})

	passport.deserializeUser(function(user, done) {
		done(null, JSON.parse(user))
	})

	if (process.env.AUTH_SECRET) {
		passport.use(new Google({
				clientID: "477715393921-ft3c5717cv685qomofqhksgtg2sk6ciu.apps.googleusercontent.com",
				clientSecret: process.env.AUTH_SECRET,
				callbackURL: process.env.REMOTE ? "http://dttw.tech/google/auth" : "http://127.0.0.1:3000/google/auth"
			},
			function(accessToken, refreshToken, profile, done) {
				for (var i = 0; i < profile.emails.length; i++) {
					if (config.admins.indexOf(profile.emails[i].value) >= 0) {
						done(null, profile)
						return
					}
				}
				done("Non Admin")
			}
		))

		app.get('/google/login',
			passport.authenticate('google', { scope: 'https://www.googleapis.com/auth/userinfo.email' }))

		app.get(/^\/google\/auth/,
			passport.authenticate('google', { failureRedirect: '/google/login' }),
			function(req, res) {
				// Successful authentication, redirect home.
				res.redirect('/admin')
			})
	} else {
		logger.warn("Missing authentication variable. Authentication will be unavailable.")
	}

	// Default Case: 404
	app.use(renderer.fourohfour.bind(renderer))

	/**
	  * API Access
	**/


	/**
	  * Start Server
	**/

	app.listen(3000)

	return app
}
