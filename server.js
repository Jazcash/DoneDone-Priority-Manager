var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var request = require('request')
var syncrequest = require('sync-request');
var _ = require('lodash');
var fs = require('fs');

var subdomain = "apitesting";
var username = "jazcash";
var apikey = fs.readFileSync('apikey.txt'); // read donedone apikey from file
var apiurl = "https://" + username + ":" + apikey + "@" + subdomain + ".mydonedone.com/issuetracker/api/v2"
var issues = [];
var rate = 3600; // donedone rate limit is 500 requests per 30 minutes

var companyDetails = getCompanyDetails(getAllCompanies()[0].id);
var companyName = companyDetails.name;
var people = companyDetails.people;

updateIssues();
setInterval(updateIssues, rate);

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
	var res = syncrequest('GET', apiurl + "/issues/all_active.json");
	return JSON.parse(res.getBody());
}