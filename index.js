'use strict';
var compareFunc = require('compare-func');
var Q = require('q');
var readFile = Q.denodeify(require('fs').readFile);
var resolve = require('path').resolve;
var path = require('path');
var pkgJson = {};
var gufg = require('github-url-from-git');
try {
  pkgJson = require(path.resolve(
    process.cwd(),
    './package.json'
  ));
} catch (err) {
  console.error('no root package.json found');
}

var parserOpts = {
  headerPattern: /^([^\(\)]*)(?:\((.*)\))? (.*)$/,
  headerCorrespondence: [
    'type',
    'scope',
    'subject'
  ],
  noteKeywords: ['BREAKING CHANGE', 'BREAKING CHANGES', '不兼容改动', '不兼容'],
  revertPattern: /^revert:\s([\s\S]*?)\s*This reverts commit (\w*)\./,
  revertCorrespondence: ['header', 'hash']
};

function issueUrl() {
  if (pkgJson.repository && pkgJson.repository.url && ~pkgJson.repository.url.indexOf('github.com')) {
    var gitUrl = gufg(pkgJson.repository.url);

    if (gitUrl) {
      return gitUrl + '/issues/';
    }
  }
}

var writerOpts = {
  transform: function(commit) {
    var discard = true;
    var issues = [];

    commit.notes.forEach(function(note) {
      note.title = 'BREAKING CHANGES';
      discard = false;
    });

    if (commit.type === '新增' || commit.type === 'feat' ) {
      commit.type = '新增:';
    } else if (commit.type === '修复' || commit.type === 'fix') {
      commit.type = '修复问题:';
    } else if (commit.type === '优化' || commit.type === 'perf' || commit.type === 'docs'  || commit.type === 'style' || commit.type === 'test' || commit.type === 'chore') {
      commit.type = '优化:';
    } else if (commit.type === '更新' || commit.type === 'refactor') {
      commit.type = '更新:';
    } else if (discard) {
      return;
    } else if (commit.type === '回滚' || commit.type === 'revert') {
      commit.type = '回滚:';
    } else if (commit.type === '合并') {
      commit.type = '合并';
    } 

    if (commit.scope === '*') {
      commit.scope = '';
    }

    if (typeof commit.hash === 'string') {
      commit.hash = commit.hash.substring(0, 7);
    }

    if (typeof commit.subject === 'string') {
      var url = issueUrl();
      if (url) {
        // GitHub issue URLs.
        commit.subject = commit.subject.replace(/#([0-9]+)/g, function(_, issue) {
          issues.push(issue);
          return '[#' + issue + '](' + url + issue + ')';
        });
      }
      // GitHub user URLs.
      commit.subject = commit.subject.replace(/@([a-zA-Z0-9_]+)/g, '[@$1](https://github.com/$1)');
      commit.subject = commit.subject;
    }

    // remove references that already appear in the subject
    commit.references = commit.references.filter(function(reference) {
      if (issues.indexOf(reference.issue) === -1) {
        return true;
      }

      return false;
    });

    return commit;
  },
  groupBy: 'type',
  commitGroupsSort: 'title',
  commitsSort: ['scope', 'subject'],
  noteGroupsSort: 'title',
  notesSort: compareFunc
};

module.exports = Q.all([
  readFile(resolve(__dirname, 'templates/template.hbs'), 'utf-8'),
  readFile(resolve(__dirname, 'templates/header.hbs'), 'utf-8'),
  readFile(resolve(__dirname, 'templates/commit.hbs'), 'utf-8'),
  readFile(resolve(__dirname, 'templates/footer.hbs'), 'utf-8')
])
  .spread(function(template, header, commit, footer) {

    writerOpts.mainTemplate = template;
    writerOpts.headerPartial = header;
    writerOpts.commitPartial = commit;
    writerOpts.footerPartial = footer;

    return {
      parserOpts: parserOpts,
      writerOpts: writerOpts
    };
  });
