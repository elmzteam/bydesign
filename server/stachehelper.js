var sprintf		= require("sprintf")
var deasync		= require("deasync")
var moment		= require("moment")
var Path		= require("path")
var marked		= require("marked")
var fs			= require("fs")
var highlight	= require("node-syntaxhighlighter")
var RSS			= require("rss");
var config		= require("../config") 


marked.setOptions({
	gfm: true,
	highlight: function(code, lang){
		return highlight.highlight(code, highlight.getLanguage(lang ? lang : "text"));
	},
})

module.exports = function(handlebars, db, root) {

	handlebars.registerHelper("noop", function(options) {
		return ""
	})
	
	/** 
	  * Helper Functions
	**/

	//String Manipulation Methods 
	function djb2(str){
		var hash = 0xc0ffee;
		for (var i = 0; i < str.length; i++) {
			hash = ((hash << 5) + hash) + str.charCodeAt(i); /* hash * 33 + c */
		}
		return hash;
	}

	function hashStringToColor(str) {
		var hash = djb2(str);
		var r = (hash & 0xFF0000) >> 16;
		var g = (hash & 0x00FF00) >> 8;
		var b = hash & 0x0000FF;
		return "#" + ("0" + r.toString(16)).substr(-2) + ("0" + g.toString(16)).substr(-2) + ("0" + b.toString(16)).substr(-2);
	}

	//Database Access Functions
	function getUser(id, cb) {
		db.authors.findOne({id: id}, function(err, data) {
			cb(err,data);
		})
	}

	function getPosts(start, end, tag, all, cb) {
		var query = {}
		if (tag) query.tags = tag
		if (!all) query.visible = true
		db.posts.find(query).sort({timestamp: -1}).skip(start).limit(end-start, cb)
	}

	function getTags(cb) {
		db.posts.distinct("tags", {visible: true}, function(err, data){
			data.sort();
			cb(err, data);
		})
	}

	function getContent(id, cb) {
		fs.readFile(Path.join(root, "posts", id+".md"), cb)
	}

	function getSize(cb) {
		db.posts.stats(function(err, res) {
			cb(null, res.count)
		})
	}

	function getPost(id, cb) {
		db.posts.findOne({timestamp: parseInt(id)}, cb)
	}

	//String Manipulation Helpers
	handlebars.registerHelper("expand", function(id) {
		return new handlebars.SafeString("<div class='expand'><a class='no-line' href='/posts/"+id+"'>Read More <dttw-icon class='material-icons'>arrow_forward</dttw-icon></a></div>");
	})
	handlebars.registerHelper("abbreviate", function(content) {
		return content.split("<more>")[0]
	})

	handlebars.registerHelper("longtime", function(time) {
		return new handlebars.SafeString(moment(time).format("MMMM Do, YYYY"))
	})

	handlebars.registerHelper("tag", function(tag, options) {
		return new handlebars.SafeString(
			sprintf("<a class='tag' href='/tags/%s' style='background-color: %s;'>%s</a>", tag, hashStringToColor(tag), tag)
		);
	})

	//Database Access and Manipulation
	handlebars.registerHelper("loadcontent", function(id) {
		var out = deasync(getContent)(id)
		if (out) {
			return marked(out.toString());
		} else {
			return "Error"
		}
	})
	
	handlebars.registerHelper("tags", function() {
		return deasync(getTags)();	
	})

	handlebars.registerHelper("fetchcontent", function(id) {
		var out = deasync(getContent)(id)
		if (out) {
			return out.toString()
		} else {
			return "Error"
		}
	})
	
	handlebars.registerHelper("fetchpost", function(id) {
		var out = deasync(getPost)(id)
		if (out) {
			return out;
		} else {
			return null;
		}
	})
	
	handlebars.registerHelper("getAuthorInfo", function(id) {
		return deasync(getUser)(id)._json
	})

	handlebars.registerHelper("posts", function(page, tag) {
		var val = parseInt(page)
		return deasync(getPosts)(val*5, (val+1)*5, tag, false)
	})

	handlebars.registerHelper("allPosts", function() {
		return deasync(getPosts)(0,0, undefined, true)
	})

	handlebars.registerHelper("rss", function() {
		var posts = deasync(getPosts)(0, 20, undefined, false)
		var feed = new RSS(config.rssInfo)
		
		for(var i = 0; i < posts.length; i++){
			feed.item({
				title: posts[i].title.text,
				description: marked(deasync(getContent)(posts[i].timestamp).toString()),
				url: config.rssInfo.site_url + posts[i].title.url,
				guid: posts[i].timestamp,
				categories: posts[i].tags,
				author: deasync(getUser)(posts[i].author)._json.displayName,
				date: posts[i].timestamp
			})
		}
		
		return feed.xml()
	})
	
	//Content Access (This is still gross)
	handlebars.registerHelper("sidebar", function() {
		return [{
			title: "About",
			content: "By Design is blog about the latest and greatest in development tools."
		}, {
			title: "Who",
			content: (new handlebars.SafeString("Contributors include <a href='zwad3.com'>Zachary Wade</a>, Matthew Savage, and others."))
		}]
	})
	
	//Handlebars Utilities
	handlebars.registerHelper("set", function(obj, key, val){
		obj[key] = val
	})

	handlebars.registerHelper("log", function(val) {
		console.log(val)
		return ""
	})

	handlebars.registerHelper("inc", function(ind) {
		return parseInt(ind) + 1;
	})

	handlebars.registerHelper("dec", function(ind) {
		return parseInt(ind) - 1; 
	})

	handlebars.registerHelper("atBottom", function(ind) {
		return parseInt(ind) >= Math.ceil(deasync(getSize)()/5)-1;
	})

	handlebars.registerHelper("atTop", function(ind) {
		return parseInt(ind) <= 0;
	})

	handlebars.registerHelper("notBottom", function(ind) {
		return parseInt(ind) <  Math.ceil(deasync(getSize)()/5)-1;
	})

	handlebars.registerHelper("notTop", function(ind) {
		return parseInt(ind) > 0;
	})

	return handlebars
}
