var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var request = require('request')
var syncrequest = require('sync-request');
var _ = require('lodash');
var fs = require('fs');

var subdomain = "quba"; //"apitesting";
var username = "jcashmore"; //"jazcash";
var key = fs.readFileSync('key.txt');
var apiurl = "https://" + username + ":" + key + "@" + subdomain + ".mydonedone.com/issuetracker/api/v2"
var colours = JSON.parse(fs.readFileSync('colours.json'));
var issues = [];
var rate = 4000; // donedone rate limit is 500 requests per 30 minutes (every 3600ms)

// company methods require admin access
//var companyDetails getCompanyDetails(getAllCompanies()[0].id);
var companyName = "Quba"; //companyDetails.name;
var people = getPeopleInProject("34690"); //companyDetails.people;
people.forEach(function(person){
	person.colour = colours[Math.floor(Math.random() * colours.length)];
});

console.log("Initilising...");
updateIssues();
setInterval(updateIssues, rate);

console.log("Serving data to clients!");

io.on('connection', function(socket){
	console.log("A user connected");
	socket.emit('init', companyName, people);
	socket.emit('allIssues', issues);

	socket.on('moveIssue', function(event){
		var issuesOldIndex = getAbsoluteIndexFromRelativeIndex(event.oldFixerId, event.oldIndex);
		var issuesNewIndex = getAbsoluteIndexFromRelativeIndex(event.newFixerId, event.newIndex);
		move(issues, issuesOldIndex, issuesNewIndex);
		socket.broadcast.emit('allIssues', issues)
	});

	socket.on('disconnect', function(){
		console.log('A user disconnected');
	});
});
app.use(express.static('public'));
app.get('/', function(req, res){
	res.sendFile(__dirname + '/client.htm');
});
http.listen(3000, function(){
	console.log('listening on *:3000');
});

function updateIssues(){
	var newIssues = getAllActiveIssues().issues;

	newIssues.forEach(function(newIssue, index, array){
		newIssue.id = newIssue.project.id + "" + newIssue.order_number;
		newIssue.url = getIssueUrl(newIssue);

		var issueIndex = getIndexOfIssue(issues, newIssue.id);
		if (issueIndex == -1){ // add new issue
			issues.push(newIssue);
			io.emit('addIssue', newIssue);
		} else { // update existing issue
			issues[issueIndex] = newIssue;
			io.emit('updateIssue', issues[issueIndex]);
		}
	});

	issues.forEach(function(issue, index, array){
		var newIssueIndex = getIndexOfIssue(newIssues, issue.id);
		if (newIssueIndex === -1){ // delete old issue
			array.splice(index, 1);
			io.emit('removeIssue', issue.id);
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
	return _.indexOf(_.pluck(issueList, 'id'), issueId);
}

function move(array, fromIndex, toIndex) {
	array.splice(toIndex, 0, array.splice(fromIndex, 1)[0] );
	return array;
}

function getAllCompanies(){
	var res = syncrequest('GET', apiurl + "/companies.json");
	return JSON.parse(res.getBody());
}

function getCompanyDetails(companyId){
	var res = syncrequest('GET', apiurl + "/companies/"+companyId+".json");
	return JSON.parse(res.getBody());
}

function getAllActiveIssues(){
	var res = syncrequest('GET', apiurl + "/issues/all_active.json?take=500"); // bad
	return JSON.parse(res.getBody());
}

function getPeopleInProject(projectId){
	var res = syncrequest('GET', apiurl + "/projects/"+projectId+"/people.json");
	return JSON.parse(res.getBody());
}

function getIssueUrl(issue){
	return "https://" + subdomain + ".mydonedone.com/issuetracker/projects/" + issue.project.id + "/issues/" + issue.order_number;
}