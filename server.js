var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var request = require('request')
var _ = require('lodash');
var fs = require('fs');

var issues = [];
var rate = 3600; // donedone rate limit is 500 requests per 30 minutes
var subdomain = "apitesting";
var username = "jazcash";
var apikey = fs.readFileSync('apikey.txt'); // read donedone apikey from file
var	action = "/issues/all_active.json";
var url = "https://" + username + ":" + apikey + "@" + subdomain + ".mydonedone.com/issuetracker/api/v2" + action;

function updateIssues(){
	request(url, function (error, response, body) {
		var newIssues = JSON.parse(body).issues;

		newIssues.forEach(function(newIssue, index, array){
			newIssue.id = newIssue.project.id + "" + newIssue.order_number;

			var issueIndex = indexOfIssueById(issues, newIssue.id);
			if (issueIndex === -1){ // add new issue
				issues.push(newIssue);
				io.emit('addIssue', newIssue);
			} else { // update existing issue
				issues[issueIndex] = newIssue;
				io.emit('updateIssues', issues);
			}
		});

		issues.forEach(function(issue, index, array){
			var newIssueIndex = indexOfIssueById(newIssues, issue.id);
			if (newIssueIndex === -1){ // delete old issue
				array.splice(index, 1);
				io.emit('removeIssue', issue.id);
			}
		});

		//console.log(_.pluck(issues, "title"));
	});
}

function indexOfIssueById(issueList, id){
	return _.indexOf(_.pluck(issueList, 'id'), id);
}

function move(array, fromIndex, toIndex) {
    array.splice(toIndex, 0, array.splice(fromIndex, 1)[0] );
    return array;
} 

updateIssues();
setInterval(updateIssues, rate);

io.on('connection', function(socket){
	console.log("A user connected");
	socket.emit('allIssues', issues);

	socket.on('moveIssue', function(indexA, indexB){
		move(issues, indexA, indexB);
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