"use strict"

const SRC     = "client"
const BUILD   = "build"

const gulp    = require("gulp")
const path    = require("path")
const $       = require("gulp-load-plugins")()

gulp.task("watch", ["build"], function() {
	gulp.watch(path.join(SRC, "scss/**/*"), ["sass"])
	gulp.watch(path.join(SRC, "js/**/*"), ["js"])
	gulp.watch(path.join(SRC, "images/**/*"), ["images"])
})

gulp.task("build", ["sass", "js", "images"])

gulp.task("sass", function() {
	return gulp.src(path.join(SRC, "scss/{style.scss,admin.scss,*.css}"))
		.pipe($.sass({ outputStyle: "compressed" }))
		.pipe($.autoprefixer({
			browsers: ["last 2 versions", "> 1%"],
			cascade: false,
			remove: false
		}))
		.pipe(gulp.dest(path.join(BUILD, "css")))
})

gulp.task("js", function() {
	return gulp.src(path.join(SRC, "js/*.*"))
		.pipe($.babel({ presets: ["es2015"] }))
		.pipe($.uglify())
		.pipe(gulp.dest(path.join(BUILD, "js")))
})

gulp.task("images", function() {
	return gulp.src(path.join(SRC, "images/*.*"))
		.pipe($.image())
		.pipe(gulp.dest(path.join(BUILD, "images")))
})
