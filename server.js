var fs = require("fs");
var express = require("express");
var app = express();
var http = require("http").Server(app);
var io = require("socket.io")(http);
var syncrequest = require("sync-request");
var colors = require("colors");
var _ = require("lodash");

colors.setTheme({silly:'rainbow',input:'grey',verbose:'cyan',prompt:'grey',info:'green',data:'grey',help:'cyan',warn:'yellow',debug:'blue',error:'red'});

var config = {};
try {
    stats = fs.lstatSync("config.json");
    if (stats.isFile()) {
        config = JSON.parse(fs.readFileSync("config.json"));
    }
} catch(e){
    console.log("No config.json file found - exiting".error);
    process.exit(1);
}

var apiurl = "https://" + config.donedone.username + ":" + config.donedone.apikey + "@" + config.donedone.subdomain + ".mydonedone.com/issuetracker/api/v2"
var colours = JSON.parse(fs.readFileSync("colours.json"));

// company methods require admin access - the block below is all hacky and dependant on all users having access to a project
//var companyDetails getCompanyDetails(getAllCompanies()[0].id);
var companyName = "Quba"; //companyDetails.name;
var people = getPeopleInProject("34690"); //companyDetails.people;
people.forEach(function(person){
	person.colour = colours[Math.floor(Math.random() * colours.length)];
});

var issues = [];
try {
	stats = fs.lstatSync("issues.json");
	if (stats.isFile()) {
		issues = JSON.parse(fs.readFileSync("issues.json"));
	}
    console.log("Found issues.json file".info);
} catch (e) {
	console.log("issues.json not found or failed to parse".warn);
} finally {
	updateIssues();
}

updateIssues();
setInterval(updateIssues, config.apiUpdateRate);

app.use(express.static("public"));

app.get("/", function(req, res){
	res.sendFile(__dirname + "/client.htm");
});

http.listen(config.port, config.host, function(){
	console.log("Listening on %s:%s".info, config.host, config.port);
});

io.on("connection", function(socket){
    console.log("%s connected".data, socket.id);
    socket.emit("init", companyName, people, issues);

    socket.on("moveIssue", function(event){
        var issuesOldIndex = getAbsoluteIndexFromRelativeIndex(event.oldFixerId, event.oldIndex);
        var issuesNewIndex = getAbsoluteIndexFromRelativeIndex(event.newFixerId, event.newIndex);
        move(issues, issuesOldIndex, issuesNewIndex);

        socket.broadcast.emit("moveIssue", event);
    });

    socket.on("disconnect", function(){
        console.log("%s disconnected".data, socket.id);
    });
});

process.on('SIGINT', function() {
    console.log("Stopping server...".warn);
    fs.writeFileSync("issues.json", JSON.stringify(issues));
});

function updateIssues(){
	var newIssues = getAllActiveIssues().issues;

	newIssues.forEach(function(newIssue, index, array){
		newIssue.id = newIssue.project.id + "" + newIssue.order_number;
		newIssue.url = getIssueUrl(newIssue);

		var issueIndex = getIndexOfIssue(issues, newIssue.id);
		if (issueIndex == -1){ // add new issue
			issues.push(newIssue);
			io.emit("addIssue", newIssue);
		} else { // update existing issue
			issues[issueIndex] = newIssue; // should really be doing difference checks instead of client-side
			io.emit("updateIssue", issues[issueIndex]);
		}
	});

	issues.forEach(function(issue, index, array){
		var newIssueIndex = getIndexOfIssue(newIssues, issue.id);
		if (newIssueIndex === -1){ // delete old issue
			array.splice(index, 1);
			io.emit("removeIssue", issue.id);
		}
	});
}

function getAbsoluteIndexFromRelativeIndex(fixerId, relIndex){
	var item = issues
		.map(function(el, index) {
			return {
				el: el,
				index: index
			};
		})
		.filter(function(el) {
			return el.el.fixer.id == fixerId;
		})[relIndex];

	return item ? item.index : -1;
}

function getIndexOfIssue(issueList, issueId){
    return _.findIndex(issueList, {id: issueId});
}

function move(array, fromIndex, toIndex) {
	array.splice(toIndex, 0, array.splice(fromIndex, 1)[0]);
	return array;
}

function getIssueUrl(issue){
    return "https://" + config.donedone.subdomain + ".mydonedone.com/issuetracker/projects/" + issue.project.id + "/issues/" + issue.order_number;
}

/* DoneDone API function wrappers */

function getAllCompanies(){
	var res = syncrequest("GET", apiurl + "/companies.json");
	return JSON.parse(res.getBody());
}

function getCompanyDetails(companyId){
	var res = syncrequest("GET", apiurl + "/companies/"+companyId+".json");
	return JSON.parse(res.getBody());
}

function getAllActiveIssues(){
	var res = syncrequest("GET", apiurl + "/issues/all_active.json?take=5"); // bad
	return JSON.parse(res.getBody());
}

function getPeopleInProject(projectId){
	var res = syncrequest("GET", apiurl + "/projects/"+projectId+"/people.json");
	return JSON.parse(res.getBody());
}